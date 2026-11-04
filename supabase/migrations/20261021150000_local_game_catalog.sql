begin;

alter table public.games
  add column if not exists year_published smallint
    check (year_published is null or year_published between 1000 and 9999),
  add column if not exists publisher varchar(120),
  add column if not exists cover_path text;

update public.games
set year_published = (metadata ->> 'yearPublished')::smallint
where year_published is null
  and coalesce(metadata ->> 'yearPublished', '') ~ '^[1-9][0-9]{3}$'
  and (metadata ->> 'yearPublished')::integer between 1000 and 9999;

do $$
declare
  scheduled_job record;
begin
  if exists (
    select 1 from pg_catalog.pg_extension where extname = 'pg_cron'
  ) then
    for scheduled_job in
      execute 'select jobid from cron.job where jobname = $1'
      using 'meeplematch-bgg-daily-sync'
    loop
      perform cron.unschedule(scheduled_job.jobid);
    end loop;
  end if;
end;
$$;

drop function if exists public.invoke_bgg_daily_sync();
drop function if exists public.sync_bgg_collection(uuid, jsonb);

insert into storage.buckets (id, name, public)
values ('game-covers', 'game-covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view game covers" on storage.objects;
create policy "Public can view game covers"
  on storage.objects for select to public
  using (bucket_id = 'game-covers');

drop policy if exists "Admins can upload game covers" on storage.objects;
create policy "Admins can upload game covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'game-covers'
    and (select public.is_admin())
  );

drop policy if exists "Admins can update game covers" on storage.objects;
create policy "Admins can update game covers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'game-covers'
    and (select public.is_admin())
  )
  with check (
    bucket_id = 'game-covers'
    and (select public.is_admin())
  );

drop policy if exists "Admins can delete game covers" on storage.objects;
create policy "Admins can delete game covers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game-covers'
    and (select public.is_admin())
  );

commit;
