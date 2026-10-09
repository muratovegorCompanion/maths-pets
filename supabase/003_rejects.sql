-- A row the table refuses is kept here with the reason, instead of vanishing while the tablet
-- deletes it from its outbox. The daily report shows how many were refused (a count only).
create table maths_pets.rejects (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  error text not null
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
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'bad batch';
  end if;
  -- Row by row: a malformed row cannot block the outbox, and it is kept in rejects instead of vanishing.
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
      insert into maths_pets.rejects (payload, error) values (r, left(sqlerrm, 300));
    end;
  end loop;
  return n;
end $$;

revoke all on function public.maths_pets_log(jsonb) from public;
grant execute on function public.maths_pets_log(jsonb) to anon;
