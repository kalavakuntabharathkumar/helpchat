import OpenAI from "openai";

export type ChatMessage = { role: "user"|"assistant"|"system"; content: string };

async function openaiStream(messages: ChatMessage[]) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages,
    stream: true,
    temperature: 0.2
  });
  return stream;
}

export async function answer(messages: ChatMessage[], onToken?: (token:string)=>void) {
  const provider = process.env.LLM_PROVIDER || "openai";
  if (provider !== "openai") {
    throw new Error("This starter includes the OpenAI streaming adapter. Add the Anthropic SDK adapter when using LLM_PROVIDER=anthropic.");
  }

  const stream = await openaiStream(messages);
  let full = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || "";
    full += token;
    if (token) onToken?.(token);
  }
  return full;
}
