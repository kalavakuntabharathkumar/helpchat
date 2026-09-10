import { Langfuse } from "@langfuse/tracing";

let client: Langfuse | undefined;
if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  client = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL
  });
}

export function startTrace(name: string, input: string) {
  if (!client) return undefined;
  return client.trace({ name, input });
}
