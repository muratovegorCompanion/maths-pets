-- The publishable key is public, so anyone can call maths_pets_log. The daily report is read by an
-- AI agent, so the only free-text columns must not be able to carry arbitrary text into it.
alter table maths_pets.answers
  add constraint answers_question_format check (question ~ '^[0-9]{1,3} [+×] [0-9]{1,3}$'),
  add constraint answers_mistake_tag_known check (mistake_tag is null or mistake_tag in
    ('forgot_carry', 'side_by_side', 'extra_ten', 'off_by_one', 'off_by_ten', 'neighbour_fact', 'added_instead'));
