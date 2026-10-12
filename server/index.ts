import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { Langfuse } from "langfuse";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/embed.js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const lf = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
});

// LLM providers, tried in order. Both speak the OpenAI API, so one SDK handles both.
// 1) OpenRouter (primary, MODEL in .env)  2) Groq (fallback, model auto-detected from what the key can use)
const MODEL = process.env.MODEL ?? "openrouter/free";
const orClient = new OpenAI({ baseURL: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1", apiKey: process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY });
const groqClient = process.env.GROQ_API_KEY ? new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY }) : null;

const GROQ_PREFS = [process.env.GROQ_MODEL, "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"].filter(Boolean) as string[];
let groqModel: Promise<string> | undefined;
function pickGroqModel(): Promise<string> {
  return (groqModel ??= groqClient!.models
    .list()
    .then((l) => {
      const ids = l.data.map((m) => m.id);
      const hit = GROQ_PREFS.find((id) => ids.includes(id)) ?? ids.find((id) => !/whisper|tts|guard|embed|compound|orpheus/i.test(id));
      if (!hit) throw new Error("no usable chat model on this Groq key");
      console.log("Groq model:", hit);
      return hit;
    })
    .catch((e) => {
      groqModel = undefined; // try again on the next request
      throw e;
    }));
}

type Provider = { name: string; client: OpenAI; getModel: () => Promise<string>; downUntil: number };
const providers: Provider[] = [
  { name: "openrouter", client: orClient, getModel: async () => MODEL, downUntil: 0 },
  ...(groqClient ? [{ name: "groq", client: groqClient, getModel: pickGroqModel, downUntil: 0 }] : []),
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Prompt construction: two versions compared in eval/run.ts
const PROMPTS: Record<string, (ctx: string) => string> = {
  v1: (ctx) => `You are a helpful customer support assistant for Acme Cloud. Use this context if useful:\n${ctx}`,
  v2: (ctx) =>
    `You are Acme Cloud's support assistant. ` +
    `If the user only greets you, thanks you or says goodbye, reply with one short friendly sentence and offer help with Acme Cloud. ` +
    `Otherwise answer ONLY from the context below, in at most 3 sentences, ` +
    `quoting exact numbers and menu paths. ` +
    `Write plain text only: no markdown, no asterisks, no bullet points, no headings. ` +
    `If the answer is not in the context, reply exactly: ` +
    `"I don't have that information, let me connect you with a human agent."\n\nContext:\n${ctx}`,
};

// Small talk handled by rules (no retrieval, no LLM): greetings, thanks, goodbye, acknowledgements.
// Real support bots do this so "hi" never reaches the knowledge base and never triggers the "I don't have that information" fallback.
const GREETING = /^\s*(hi+|hello+|hey+|hiya|yo|howdy|namaste|greetings|good\s+(morning|afternoon|evening))(\s+(there|team|support|bot|everyone|all))?\W*$/i;
const THANKS = /^\s*(thanks?|thank\s+you|thx|ty|many\s+thanks)(\s+(a\s+lot|so\s+much|very\s+much|again))?\W*$/i;
const BYE = /^\s*(bye+|goodbye|good\s?bye|see\s+(you|ya)|that'?s\s+all|nothing\s+else|no\s+thanks?|i'?m\s+good)\W*$/i;
const ACK = /^\s*(ok(ay)?|got\s+it|cool|great|alright|fine|sure|nice|understood)\W*$/i;
function smallTalk(msg: string): string | null {
  if (GREETING.test(msg)) return "Hi! I'm the Acme Cloud support assistant. How can I help you today?";
  if (THANKS.test(msg)) return "You're welcome! Is there anything else I can help you with?";
  if (BYE.test(msg)) return "Goodbye! Thanks for contacting Acme Cloud support. Take care.";
  if (ACK.test(msg)) return "Great! Let me know if there is anything else I can help you with.";
  return null;
}

// Context retrieval: semantic vector search (pgvector) over embedded PDF knowledge-base chunks, top 4
async function retrieve(q: string) {
  const { data, error } = await sb.rpc("match_kb", { q: await embed(q), n: 4 });
  if (error) {
    console.error("RETRIEVE ERROR:", error.message); // do not hide database problems
    return "";
  }
  return (data ?? []).map((a: any) => `${a.title}: ${a.body}`).join("\n");
}

// save one finished turn (session row + user message + assistant message)
async function saveTurn(sessionId: string, promptVersion: string, message: string, answer: string) {
  const s = await sb.from("sessions").upsert({ id: sessionId, prompt_version: promptVersion });
  const m = await sb.from("messages").insert([
    { session_id: sessionId, role: "user", content: message },
    { session_id: sessionId, role: "assistant", content: answer },
  ]);
  if (s.error || m.error) console.error("SUPABASE ERROR:", s.error ?? m.error);
}

const app = express();
app.use(cors(), express.json());

// Status page so opening http://localhost:3001 in a browser shows the server is alive
app.get("/", (_req, res) => {
  res.send(`helpchat server is running OK. Providers: openrouter (${MODEL})${groqClient ? ", groq (auto-detected model)" : ""}. Chat UI: run "npm run web" and open http://localhost:5173`);
});

app.post("/chat", async (req, res) => {
 try {
  const body = (req.body ?? {}) as { sessionId?: unknown; message?: unknown; promptVersion?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const promptVersion = typeof body.promptVersion === "string" ? body.promptVersion : "v2";
  if (!sessionId || !message) return void res.status(400).type("text/plain").send("sessionId and message are required.");
  if (message.length > 2000) return void res.status(400).type("text/plain").send("Message is too long (max 2000 characters).");
  if (!PROMPTS[promptVersion]) return void res.status(400).type("text/plain").send(`Unknown promptVersion "${promptVersion}". Use v1 or v2.`);

  // Small talk: answer by rule, still traced in Langfuse and saved in Supabase
  const quick = smallTalk(message);
  if (quick) {
    const traceId = randomUUID();
    const trace = lf.trace({ id: traceId, name: "support-chat", sessionId, input: message, metadata: { promptVersion, provider: "rule" } });
    trace.update({ output: quick });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("x-trace-id", traceId);
    res.setHeader("x-provider", "rule");
    res.end(quick);
    await saveTurn(sessionId, promptVersion, message, quick).catch((e) => console.error("SAVE ERROR:", e));
    await lf.flushAsync().catch(() => {});
    return;
  }

  const context = await retrieve(message);
  const { data: history, error: histErr } = await sb.from("messages").select("role,content").eq("session_id", sessionId).order("id");
  if (histErr) console.error("HISTORY ERROR:", histErr.message);
  const messages = [
    { role: "system", content: PROMPTS[promptVersion](context) },
    ...(history ?? []),
    { role: "user", content: message },
  ] as OpenAI.Chat.ChatCompletionMessageParam[];

  // Langfuse: one trace per chat turn, grouped by sessionId
  const traceId = randomUUID();
  const trace = lf.trace({ id: traceId, name: "support-chat", sessionId, input: message, metadata: { promptVersion } });
  const gen = trace.generation({ name: "llm-reply", model: MODEL, input: messages });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("x-trace-id", traceId);
  let answer = "";
  let usedName = providers[0].name;
  let usedModel = MODEL;
  let lastErr: unknown;

  // skip providers that hit a daily limit or a bad key; if every provider is down, try the one that recovers first
  const now = Date.now();
  const live = providers.filter((p) => now >= p.downUntil);
  const order = live.length ? live : [providers.reduce((a, b) => (a.downUntil <= b.downUntil ? a : b))];

  for (const p of order) {
    usedName = p.name;
    const isLast = p === order[order.length - 1];
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        usedModel = await p.getModel();
        const params: any = { model: usedModel, messages, stream: true, max_tokens: 600 };
        if (p.name === "groq" && /gpt-oss/i.test(usedModel)) params.reasoning_effort = "low"; // fewer hidden reasoning tokens
        const stream = (await p.client.chat.completions.create(params)) as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
        for await (const chunk of stream) {
          const t = chunk.choices[0]?.delta?.content ?? "";
          if (!t) continue;
          if (!answer) res.setHeader("x-provider", p.name);
          answer += t;
          res.write(t); // response streaming to the React frontend
        }
        if (answer) break;
        throw new Error("empty response from model");
      } catch (e) {
        lastErr = e;
        const status = (e as { status?: number })?.status;
        const text = e instanceof Error ? e.message : String(e);
        console.error(`LLM ERROR (${p.name}): ${status ?? ""} ${text.slice(0, 200)}`);
        if (answer) break; // text was already streamed to the browser, so we cannot restart
        const perDay = status === 429 && /per[- ]day|\(TPD\)/i.test(text);
        if (status === 429 && !perDay && isLast) {
          // per-minute limit on the last provider: wait the time the API suggests, then retry
          const m = text.match(/try again in ([\d.]+)\s*(ms|s)/i);
          const wait = m ? Math.min(20000, Number(m[1]) * (m[2].toLowerCase() === "ms" ? 1 : 1000) + 500) : 3000;
          await sleep(wait);
          continue;
        }
        if (perDay) p.downUntil = Date.now() + 30 * 60_000;
        else if (status && [401, 402, 403, 404].includes(status)) p.downUntil = Date.now() + 10 * 60_000;
        if (p.name === "groq" && status === 404) groqModel = undefined;
        break; // move on to the next provider
      }
    }
    if (answer) break;
  }
  if (answer) {
    gen.end({ output: answer, model: usedModel, metadata: { provider: usedName } });
  } else {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    gen.end({ output: msg, level: "ERROR", statusMessage: msg, model: usedModel });
    res.write(`Sorry, something went wrong: ${msg}`);
  }
  trace.update({ output: answer, metadata: { promptVersion, provider: usedName } });
  res.end();

  await saveTurn(sessionId, promptVersion, message, answer).catch((e) => console.error("SAVE ERROR:", e));
  await lf.flushAsync().catch(() => {});
 } catch (e) {
  // last-resort guard: never leave the browser hanging
  console.error("CHAT ROUTE ERROR:", e);
  const msg = e instanceof Error ? e.message : String(e);
  if (!res.headersSent) res.status(500).type("text/plain").send(`Sorry, something went wrong: ${msg}`);
  else res.end();
 }
});

app.listen(3001, () => {
  console.log(`helpchat server on http://localhost:3001 (openrouter: ${MODEL}${groqClient ? " -> groq: auto" : ""})`);
  if (groqClient) pickGroqModel().catch((e) => console.error("Groq check failed:", e instanceof Error ? e.message : e));
});