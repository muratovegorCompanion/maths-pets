-- supabase/001_maths_pets.sql
create schema if not exists maths_pets;
revoke all on schema maths_pets from public, anon, authenticated;

create table maths_pets.answers (
  id bigint generated always as identity primary key,
  client_id uuid not null unique,
  device_id uuid not null,
  answered_at timestamptz not null,
  received_at timestamptz not null default now(),
  mode text not null check (mode in ('walk', 'zoomies')),
  track text not null check (track in ('add', 'times')),
  level smallint not null check (level between 0 and 6),
  question text not null check (length(question) <= 20),
  correct_answer integer not null,
  given_answer integer,
  is_correct boolean not null,
  input_kind text not null check (input_kind in ('choice', 'keypad')),
  mistake_tag text check (length(mistake_tag) <= 30),
  hint_used boolean not null default false,
  seconds numeric(6,1) check (seconds >= 0 and seconds < 3600)
);
alter table maths_pets.answers enable row level security;
create index on maths_pets.answers (answered_at);

create or replace function public.maths_pets_log(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  n integer := 0;
  k integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'bad batch';
  end if;
  -- Row by row: one malformed row is skipped instead of blocking the whole outbox forever.
  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      insert into maths_pets.answers (client_id, device_id, answered_at, mode, track, level, question,
        correct_answer, given_answer, is_correct, input_kind, mistake_tag, hint_used, seconds)
      values ((r->>'client_id')::uuid, (r->>'device_id')::uuid, (r->>'answered_at')::timestamptz,
        r->>'mode', r->>'track', (r->>'level')::smallint, r->>'question',
        (r->>'correct_answer')::integer, (r->>'given_answer')::integer, (r->>'is_correct')::boolean,
        r->>'input_kind', r->>'mistake_tag', coalesce((r->>'hint_used')::boolean, false), (r->>'seconds')::numeric)
      on conflict (client_id) do nothing;
      get diagnostics k = row_count;
      n := n + k;
    exception when others then
      null;
    end;
  end loop;
  return n;
end $$;

revoke all on function public.maths_pets_log(jsonb) from public;
grant execute on function public.maths_pets_log(jsonb) to anon;
