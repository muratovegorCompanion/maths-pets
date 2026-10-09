-- A refused row is counted, not lost: the tablet deletes a row from its outbox once the call
-- succeeds, so without this a systematic refusal would silently drop every answer.
-- Only the reason is kept — never the client's text (the key is public, anyone can call this) —
-- and refusals are counted per day and reason, so junk sent from outside cannot hide real ones.
-- The daily report reads the count only.
create table maths_pets.rejects (
  day date not null,
  code text not null,               -- SQLSTATE; not named "sqlstate": that is a PL/pgSQL variable
  constraint_name text not null default '',
  n integer not null default 0,
  last_at timestamptz not null default now(),
  primary key (day, code, constraint_name)
);
alter table maths_pets.rejects enable row level security;

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
  v_state text;
  v_constraint text;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'bad batch';
  end if;
  -- Row by row: a malformed row cannot block the outbox. Refusals are counted per day and reason —
  -- no client text is stored, the table stays tiny, and junk from outside cannot crowd out real counts.
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
      get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name;
      insert into maths_pets.rejects as x (day, code, constraint_name, n)
      values ((now() at time zone 'Asia/Bangkok')::date, v_state, coalesce(v_constraint, ''), 1)
      on conflict (day, code, constraint_name) do update set n = x.n + 1, last_at = now();
    end;
  end loop;
  return n;
end $$;

revoke all on function public.maths_pets_log(jsonb) from public;
grant execute on function public.maths_pets_log(jsonb) to anon;
