create extension if not exists "uuid-ossp";
create table if not exists chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now()
);
create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);
create index if not exists chat_messages_session_idx on chat_messages(session_id, created_at);
