import "dotenv/config";
import fs from "node:fs";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/embed.js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
await sb.from("kb_articles").delete().neq("id", 0); // safe to re-run
let n = 0;
for (const file of ["docs/acme-1.pdf", "docs/acme-2.pdf"]) {
  let text = (await pdf(fs.readFileSync(file))).text.split("\n")
    .filter((l) => !/^ACME Cloud Customer Support/.test(l) && !/^\d+$/.test(l.trim())).join("\n"); // strip page headers and page numbers
  text = text.slice(text.search(/^1\s+[A-Za-z ]+$/m)); // skip the table of contents
  for (const p of text.split(/^(?=\d+(?:\.\d+)?\s*[A-Z“"])/m)) { // one chunk per numbered section
    if (!/^\d/.test(p) || p.length < 60) continue;
    const body = p.replace(/\s+/g, " ").trim();
    const { error } = await sb.from("kb_articles").insert({ title: p.split("\n")[0].trim(), body, embedding: await embed(body) });
    if (error) throw error;
    n++;
  }
}
console.log(`ingested ${n} chunks`);