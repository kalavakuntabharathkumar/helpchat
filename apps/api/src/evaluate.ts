import fs from "node:fs";
import dotenv from "dotenv";
import { answer } from "./llm.js";
import { retrieveContext } from "./knowledge.js";
import { SYSTEM_PROMPT_V1, SYSTEM_PROMPT_V2 } from "./prompts.js";

dotenv.config();

type Item = { id:number; question:string; expectedTopic:string; mustMention:string[] };
const items: Item[] = JSON.parse(fs.readFileSync("eval/questions.json","utf8"));

async function run(prompt: string) {
  const results = [];
  for (const item of items) {
    const context = retrieveContext(item.question).map(x=>x.content).join("\n");
    const output = await answer([
      {role:"system", content:prompt},
      {role:"system", content:`Context:\n${context || "No matching context."}`},
      {role:"user", content:item.question}
    ]);
    const normalized = output.toLowerCase();
    const hits = item.mustMention.filter(x=>normalized.includes(x.toLowerCase())).length;
    results.push({ ...item, output, keywordHitRate: hits / Math.max(1,item.mustMention.length) });
    console.log(`${item.id}/${items.length} ${Math.round(results.at(-1)!.keywordHitRate*100)}%`);
  }
  return results;
}

const v1 = await run(SYSTEM_PROMPT_V1);
const v2 = await run(SYSTEM_PROMPT_V2);
const avg = (xs:any[]) => xs.reduce((s,x)=>s+x.keywordHitRate,0)/xs.length;
fs.writeFileSync("eval/results.json", JSON.stringify({
  questions: items.length,
  promptV1AverageKeywordHitRate: avg(v1),
  promptV2AverageKeywordHitRate: avg(v2),
  v1, v2
}, null, 2));
console.log("Wrote eval/results.json");
