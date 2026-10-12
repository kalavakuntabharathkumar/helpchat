create extension if not exists vector;

create table if not exists kb_articles (id serial primary key, title text, body text, embedding vector(384));
create table if not exists sessions (id text primary key, prompt_version text, created_at timestamptz default now());
create table if not exists messages (id bigserial primary key, session_id text references sessions(id), role text, content text);
alter table kb_articles disable row level security;
alter table sessions disable row level security;
alter table messages disable row level security;

create index if not exists kb_articles_embedding_idx on kb_articles using hnsw (embedding vector_cosine_ops);

-- semantic search used by server/index.ts: top n chunks closest to the question embedding
create or replace function match_kb(q vector(384), n int)
returns table (id int, title text, body text, similarity float)
language sql stable as $$
  select id, title, body, 1 - (embedding <=> q) as similarity
  from kb_articles
  order by embedding <=> q
  limit n;
$$;

-- The knowledge base is filled by `npm run ingest` (reads docs/*.pdf), not by seed rows.