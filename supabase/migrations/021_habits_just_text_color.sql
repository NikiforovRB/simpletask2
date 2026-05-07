-- Добавляем тип привычек "Просто текст с цветом" (just_text_color)
alter table public.habits
  drop constraint if exists habits_type_check;

alter table public.habits
  add constraint habits_type_check
  check (type in ('yes_no', 'not_more', 'not_less', 'not_later', 'just_time', 'just_text', 'just_text_color'));
