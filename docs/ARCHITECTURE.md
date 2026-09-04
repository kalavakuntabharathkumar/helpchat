# Architecture

React -> Node/Express -> retrieval -> prompt assembly -> LLM streaming
                                      |
                                      +-> Langfuse trace
                                      +-> optional Supabase persistence

The retrieval layer ranks a small local knowledge base by keyword overlap. It is deliberately
simple for the portfolio project so the data flow is easy to inspect and explain in an interview.

The LLM adapter is isolated in `llm.ts`, making provider/model changes independent from the
HTTP layer. The prompt versions live in `prompts.ts` and the regression set lives in `eval/`.
