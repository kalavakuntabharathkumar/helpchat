import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Langfuse } from "langfuse";

// Run with the server up: npm run server  (then)  npm run eval
const API = process.env.API_URL ?? "http://localhost:3001";
const lf = new Langfuse({ publicKey: process.env.LANGFUSE_PUBLIC_KEY, secretKey: process.env.LANGFUSE_SECRET_KEY, baseUrl: process.env.LANGFUSE_HOST });
type Q = { q: string; kw: string[]; oos?: boolean; talk?: boolean };
const qs: Q[] = JSON.parse(readFileSync("eval/questions.json", "utf8")); // test set: in-scope, out-of-scope and small-talk (greetings/thanks/bye) questions
const REFUSAL = /don't have|do not have|no information|not (mentioned|specified|provided|available|documented)|human agent|can't find|cannot find/i;

let sessions = 0;
async function ask(q: string, version: string) {
  let out = { answer: "", traceId: "", error: true };
  for (let i = 0; i < 3 && out.error; i++) {
    await new Promise((r) => setTimeout(r, i ? 4000 * i : 2500)); // pace calls to stay under free-tier rate limits; back off on retries
    sessions++;
    const r = await fetch(`${API}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: randomUUID(), message: q, promptVersion: version }) });
    const answer = await r.text();
    out = { answer, traceId: r.headers.get("x-trace-id")!, error: answer.startsWith("Sorry, something went wrong") };
  }
  return out;
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn));
}

// normalise model output before grading: lowercase, curly quotes to straight, any kind of space (incl. non-breaking) to one space
const norm = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ");
// same grader for both prompts: out-of-scope must be declined, in-scope must contain the expected facts. Returns "" on pass, else the failure type
function grade({ kw, oos, talk }: Q, answer: string) {
  const a = norm(answer);
  if (talk) return REFUSAL.test(a) ? "false_refusal" : kw.every((k) => k.split("|").some((alt) => a.includes(alt))) ? "" : "bad_small_talk";
  if (oos) return REFUSAL.test(a) ? "" : "hallucinated_answer";
  if (kw.every((k) => k.split("|").some((alt) => a.includes(alt)))) return "";
  if (REFUSAL.test(a)) return "false_refusal";
  return "missing_or_wrong_detail";
}
// quality checks applied to EVERY answer, whether or not it is correct
const LONG_WORDS = 70;
const wordCount = (a: string) => a.split(/\s+/).filter(Boolean).length;
const hasMarkdown = (a: string) => /\*\*|^#{1,6}\s|^\s*[-*\u2022]\s|^\s*\d+\.\s/m.test(a); // the chat page shows plain text, so markdown shows up as raw symbols

const res: Record<string, { in: number[]; oos: number[]; talk: number[]; err: number }> = { v1: { in: [0, 0], oos: [0, 0], talk: [0, 0], err: 0 }, v2: { in: [0, 0], oos: [0, 0], talk: [0, 0], err: 0 } };
const issues: Record<string, Record<string, number>> = {};
const failures: object[] = [];
const flag = (name: string, v: string, q: string, answer: string) => {
  (issues[name] ??= { v1: 0, v2: 0 })[v]++;
  failures.push({ v, q, issue: name, answer: answer.slice(0, 250) });
};
for (const v of ["v1", "v2"]) {
  await pool(qs, 1, async (item) => {
    const { answer, traceId, error } = await ask(item.q, v);
    if (error) { res[v].err++; lf.score({ traceId, name: "api_error", value: 1 }); return; } // API failures are NOT counted as wrong answers
    const issue = grade(item, answer);
    const g = res[v][item.oos ? "oos" : item.talk ? "talk" : "in"];
    g[1]++;
    if (!issue) g[0]++;
    else flag(issue, v, item.q, answer);
    if (wordCount(answer) > LONG_WORDS) flag("overly_long_answer", v, item.q, answer);
    if (hasMarkdown(answer)) flag("markdown_in_plain_text_chat", v, item.q, answer);
    lf.score({ traceId, name: "correct", value: issue ? 0 : 1, comment: issue || "ok" });
  });
}
// extra scripted traffic (not real users) so Langfuse holds 100+ traced sessions in total
await pool(Array.from({ length: 50 }, (_, i) => qs[i % qs.length]), 1, async ({ q }) => void (await ask(q, "v2")));

const pct = ([ok, n]: number[]) => (n ? `${ok}/${n} (${((100 * ok) / n).toFixed(0)}%)` : "n/a");
const all = (v: string) => [res[v].in[0] + res[v].oos[0] + res[v].talk[0], res[v].in[1] + res[v].oos[1] + res[v].talk[1]];
const nIn = qs.filter((x) => !x.oos && !x.talk).length, nOos = qs.filter((x) => x.oos).length, nTalk = qs.filter((x) => x.talk).length;
const top = Object.entries(issues).sort((a, b) => b[1].v1 + b[1].v2 - (a[1].v1 + a[1].v2)).slice(0, 3);
const report = `# Prompt evaluation results

Traced sessions in Langfuse: ${sessions} (${qs.length * 2} eval + 50 scripted extra traffic, plus retries)
Test set: ${qs.length} questions (${nIn} in-scope, ${nOos} out-of-scope, ${nTalk} small talk), 2 prompt versions. API errors are excluded from accuracy.

| Prompt | In-scope accuracy | Out-of-scope handled | Small talk handled | Overall | API errors |
|---|---|---|---|---|---|
| v1 | ${pct(res.v1.in)} | ${pct(res.v1.oos)} | ${pct(res.v1.talk)} | ${pct(all("v1"))} | ${res.v1.err} |
| v2 | ${pct(res.v2.in)} | ${pct(res.v2.oos)} | ${pct(res.v2.talk)} | ${pct(all("v2"))} | ${res.v2.err} |

## Top recurring prompt-quality issues
${top.map(([k, c], i) => `${i + 1}. ${k}: ${c.v1 + c.v2} answers affected (v1: ${c.v1}/${all("v1")[1]}, v2: ${c.v2}/${all("v2")[1]})`).join("\n") || "None found"}

Flagged answers (wrong answers and quality issues) are saved in eval/failures.json for debugging.
`;
writeFileSync("RESULTS.md", report);
writeFileSync("eval/failures.json", JSON.stringify(failures, null, 2));
await lf.flushAsync();
console.log(report);