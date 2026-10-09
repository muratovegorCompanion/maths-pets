-- A refused row is counted, not lost: the tablet deletes a row from its outbox once the call
-- succeeds, so without this a systematic refusal would silently drop every answer.
-- Only the reason is kept — never the client's text (the key is public, anyone can call this) —
-- and at most 1000 refusals a day. The daily report reads the count only.
create table maths_pets.rejects (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  sqlstate text not null,
  constraint_name text,
  payload_bytes integer not null
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
  -- Row by row: a malformed row cannot block the outbox. A refused row is counted in rejects with
  -- the reason code only: no client text is stored, and at most 1000 refusals a day are kept.
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
      if (select count(*) from maths_pets.rejects where received_at > now() - interval '1 day') < 1000 then
        insert into maths_pets.rejects (sqlstate, constraint_name, payload_bytes)
        values (v_state, nullif(v_constraint, ''), pg_column_size(r));
      end if;
    end;
  end loop;
  return n;
end $$;

revoke all on function public.maths_pets_log(jsonb) from public;
grant execute on function public.maths_pets_log(jsonb) to anon;
