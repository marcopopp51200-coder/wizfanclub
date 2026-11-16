-- Memory (Jahresrückblick) – Tabelle anlegen (falls noch nicht geschehen) + Spalte für den Uploader
create table if not exists public.rok_memory (
  user_id    uuid not null references auth.users(id) on delete cascade,
  year       int  not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);
alter table public.rok_memory add column if not exists governor_id bigint;
alter table public.rok_memory enable row level security;
drop policy if exists "memory_select_own" on public.rok_memory;
drop policy if exists "memory_insert_own" on public.rok_memory;
drop policy if exists "memory_update_own" on public.rok_memory;
drop policy if exists "memory_delete_own" on public.rok_memory;
create policy "memory_select_own" on public.rok_memory for select using (auth.uid() = user_id);
create policy "memory_insert_own" on public.rok_memory for insert with check (auth.uid() = user_id);
create policy "memory_update_own" on public.rok_memory for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "memory_delete_own" on public.rok_memory for delete using (auth.uid() = user_id);
