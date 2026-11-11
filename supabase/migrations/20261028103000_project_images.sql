begin;

alter table public.projects
  add column if not exists image_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'project-images',
  'project-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can view project images" on storage.objects;
create policy "Public can view project images"
  on storage.objects for select to public
  using (bucket_id = 'project-images');

drop policy if exists "Owners can upload project images" on storage.objects;
create policy "Owners can upload project images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owners can update project images" on storage.objects;
create policy "Owners can update project images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owners can delete project images" on storage.objects;
create policy "Owners can delete project images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
