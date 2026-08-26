-- How one node shows the level under it when the branches of the map grow
-- down: children spread across a row, as they do by default, or stacked in one
-- column hanging off the left edge of the node. It belongs to the node, so a
-- map can read across in one place and down in another.

alter table public.mind_nodes
  add column if not exists kids_layout text not null default 'row';

alter table public.mind_nodes drop constraint if exists mind_nodes_kids_layout_check;
alter table public.mind_nodes
  add constraint mind_nodes_kids_layout_check check (kids_layout in ('row', 'column'));
