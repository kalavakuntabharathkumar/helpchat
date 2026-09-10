import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { answer } from "./llm.js";
import { retrieveContext } from "./knowledge.js";
import { SYSTEM_PROMPT_V2 } from "./prompts.js";
import { startTrace } from "./tracing.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req,res)=>res.json({ok:true, service:"ai-support-chat"}));

app.post("/api/chat", async (req,res) => {
  const question = String(req.body.message || "").trim();
  if (!question) return res.status(400).json({error:"message required"});

  const context = retrieveContext(question);
  const contextText = context.length
    ? context.map(x=>`[${x.title}] ${x.content}`).join("\n")
    : "No matching support article was found.";

  const trace = startTrace("support-chat", question);
  const messages = [
    { role:"system" as const, content:SYSTEM_PROMPT_V2 },
    { role:"system" as const, content:`Support context:\n${contextText}` },
    ...(Array.isArray(req.body.history) ? req.body.history.slice(-8) : []),
    { role:"user" as const, content:question }
  ];

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");

  try {
    let response = "";
    response = await answer(messages, token => res.write(`data: ${JSON.stringify({token})}\n\n`));
    trace?.update({ output: response, metadata: { contextArticles: context.map(x=>x.title) } });
    res.write(`data: ${JSON.stringify({done:true})}\n\n`);
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({error:String(e)})}\n\n`);
    res.end();
  }
});

app.listen(Number(process.env.PORT || 4100), ()=>console.log("Support API on http://localhost:4100"));
