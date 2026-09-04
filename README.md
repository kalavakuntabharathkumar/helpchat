# AI-Assisted Support Chat with Evaluation & Tracing

A portfolio/demo customer-support chat application showing:
- React frontend
- TypeScript/Node.js backend
- OpenAI or Anthropic-compatible LLM adapter
- Context retrieval from a small support knowledge base
- Streaming responses
- Langfuse tracing hooks
- Prompt evaluation runner over a 30-question dataset
- Supabase persistence

## Setup

```bash
cd apps/api
npm install
cp .env.example .env
npm run dev
```

```bash
cd apps/web
npm install
npm run dev
```

Set `LLM_PROVIDER=openai` or `LLM_PROVIDER=anthropic`.

For OpenAI:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: gpt-4.1-mini)

For Anthropic:
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (default: claude-3-5-haiku-latest)

Optional Langfuse:
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

Optional Supabase:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Evaluation

Run:

```bash
cd apps/api
npm run eval
```

The evaluator loads `eval/questions.json`, calls the selected model for each question,
and writes results to `eval/results.json`. The included dataset contains 30 questions
covering billing, orders, accounts, returns, and technical support.

## Tracing

`src/tracing.ts` creates a Langfuse trace when credentials are available. The implementation
is intentionally optional so the application still runs without external tracing credentials.

## Important

No real customer data or credentials are included. The sample knowledge base and evaluation
questions are synthetic demo content.
