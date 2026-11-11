begin;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

drop policy if exists "Authenticated users can view avatars"
  on storage.objects;
create policy "Authenticated users can view avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar"
  on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  );

drop policy if exists "Users can update their own avatar"
  on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  );

drop policy if exists "Users can delete their own avatar"
  on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  );

drop policy if exists "Participants can send messages as themselves"
  on public.messages;
revoke insert on public.messages from authenticated;
grant select on public.conversations, public.invitations, public.profiles,
  public.push_tokens to service_role;
grant select, insert on public.messages to service_role;
grant insert on public.notifications to service_role;

commit;
