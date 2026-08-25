-- The colour a habit's name is drawn in, in the first column of the table:
-- 'grey' to keep it quiet, 'bright' to make it stand out. Null means as it was
-- before the choice existed — the informational types quiet, the rest bright.

alter table public.habits
  add column if not exists name_tone text;
