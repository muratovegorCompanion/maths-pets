-- Maths Pets: the day's numbers for the evening report.
-- The day is today in Bangkok time; before noon it is yesterday (the run was delayed because the Mac was off).
-- Run each statement separately; each one starts with the same "params" CTE.

-- 1. Day summary. Only walk answers count towards the daily goal of 20.
with params as (select case when extract(hour from now() at time zone 'Asia/Bangkok') < 12
                            then (now() at time zone 'Asia/Bangkok')::date - 1
                            else (now() at time zone 'Asia/Bangkok')::date end as day),
day_rows as (select a.* from maths_pets.answers a, params p where (a.answered_at at time zone 'Asia/Bangkok')::date = p.day)
select (select day from params) as day,
       count(*) filter (where mode = 'walk') as walk_answers,
       count(*) filter (where mode = 'walk' and is_correct) as walk_right,
       count(*) filter (where mode = 'zoomies') as zoomies_answers,
       count(*) filter (where mode = 'zoomies' and is_correct) as zoomies_right,
       round(coalesce(sum(seconds), 0) / 60.0, 1) as minutes_thinking,
       count(distinct device_id) as devices
from day_rows;

-- 2. Where she is: highest step per track today, and how she did on it.
with params as (select case when extract(hour from now() at time zone 'Asia/Bangkok') < 12
                            then (now() at time zone 'Asia/Bangkok')::date - 1
                            else (now() at time zone 'Asia/Bangkok')::date end as day),
day_rows as (select a.* from maths_pets.answers a, params p
             where a.mode = 'walk' and (a.answered_at at time zone 'Asia/Bangkok')::date = p.day),
top as (select track, max(level) as level from day_rows group by track)
select t.track, t.level,
       count(*) as answers_at_level,
       count(*) filter (where d.is_correct) as right_at_level,
       count(*) filter (where d.input_kind = 'choice') as picked,
       count(*) filter (where d.input_kind = 'keypad') as typed
from top t join day_rows d on d.track = t.track and d.level = t.level
group by t.track, t.level;

-- 3. Mistakes by kind, with up to three examples each.
with params as (select case when extract(hour from now() at time zone 'Asia/Bangkok') < 12
                            then (now() at time zone 'Asia/Bangkok')::date - 1
                            else (now() at time zone 'Asia/Bangkok')::date end as day)
select track, coalesce(mistake_tag, 'other') as kind, count(*) as n,
       (array_agg(question || ' → ' || coalesce(given_answer::text, '—') || ' (верно ' || correct_answer || ')' order by answered_at))[1:3] as examples
from maths_pets.answers a, params p
where not is_correct and (a.answered_at at time zone 'Asia/Bangkok')::date = p.day
group by track, kind order by n desc;

-- 4. Days with 20+ walk answers over the last 30 days (for the streak).
select (answered_at at time zone 'Asia/Bangkok')::date as day, count(*) filter (where mode = 'walk') as walk_answers
from maths_pets.answers
where answered_at > now() - interval '30 days'
group by 1 order by 1 desc;
