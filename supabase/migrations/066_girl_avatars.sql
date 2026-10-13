-- 066: фото (аватарки) в разделе «Девушки»
-- Файлы лежат в приватном бакете Supabase Storage `girl-avatars` по пути
-- `<user_id>/<girl_id>-<метка>.jpg`; доступ — только владельцу и только избранным.

alter table public.girls
  add column if not exists avatar_path text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('girl-avatars', 'girl-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Girl avatars: owner reads" on storage.objects;
create policy "Girl avatars: owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'girl-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chosen_user()
  );

drop policy if exists "Girl avatars: owner uploads" on storage.objects;
create policy "Girl avatars: owner uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'girl-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chosen_user()
  );

drop policy if exists "Girl avatars: owner updates" on storage.objects;
create policy "Girl avatars: owner updates" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'girl-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chosen_user()
  )
  with check (
    bucket_id = 'girl-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chosen_user()
  );

drop policy if exists "Girl avatars: owner deletes" on storage.objects;
create policy "Girl avatars: owner deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'girl-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chosen_user()
  );
