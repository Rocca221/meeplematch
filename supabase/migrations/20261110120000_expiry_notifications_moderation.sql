-- MeepleMatch · duración de anuncios, bandeja de notificaciones y moderación.
-- Ejecutar UNA sola vez en Supabase → SQL Editor (contenido completo).
begin;

-- ═══════════ 1. Duración de los anuncios ═══════════
-- NULL = sin vencimiento. Pasada la fecha, el anuncio deja de verse para los
-- demás (lo aplica la política de lectura); el dueño y los admins lo siguen viendo.
alter table public.projects
  add column if not exists expires_at timestamptz;

create index if not exists projects_expires_at_idx
  on public.projects (expires_at)
  where expires_at is not null;

drop policy if exists "Users can view visible projects" on public.projects;
create policy "Users can view visible projects"
  on public.projects for select to authenticated
  using (
    (status <> 'draft' and (expires_at is null or expires_at > now()))
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );

-- ═══════════ 2. Suspensión de usuarios ═══════════
create table if not exists public.user_suspensions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason varchar(300),
  suspended_by uuid references public.profiles (id) on delete set null,
  suspended_at timestamptz not null default now()
);

alter table public.user_suspensions enable row level security;
revoke all on table public.user_suspensions from anon, authenticated;
-- Sin políticas ni permisos directos: solo se accede por las funciones de abajo.
-- La función `send-message` (service role) comprueba la suspensión antes de enviar.
grant select on public.user_suspensions to service_role;

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_suspended() from public, anon;
grant execute on function public.is_suspended() to authenticated;

-- Un usuario suspendido no puede publicar, mostrar interés ni invitar.
drop policy if exists "Users can create projects as themselves" on public.projects;
create policy "Users can create projects as themselves"
  on public.projects for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not (select public.is_suspended())
  );

drop policy if exists "Users can express interest as themselves"
  on public.project_interests;
create policy "Users can express interest as themselves"
  on public.project_interests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not (select public.is_suspended())
    and status = 'pending'
    and exists (
      select 1
      from public.projects
      where projects.id = project_interests.project_id
        and projects.status = 'open'
        and (projects.expires_at is null or projects.expires_at > now())
        and projects.owner_id <> (select auth.uid())
    )
  );

drop policy if exists "Users can send invitations as themselves"
  on public.invitations;
create policy "Users can send invitations as themselves"
  on public.invitations for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and not (select public.is_suspended())
    and receiver_id <> (select auth.uid())
    and status = 'pending'
  );

-- ═══════════ 3. Funciones de administración ═══════════
create or replace function public.admin_list_users(
  search text default null,
  max_rows integer default 100
)
returns table (
  id uuid,
  display_name text,
  email text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  projects_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Solo los administradores pueden ver esta lista.'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.display_name::text,
    u.email::text,
    coalesce(r.role, 'user')::text,
    p.created_at,
    u.last_sign_in_at,
    s.suspended_at,
    s.reason::text,
    (select count(*) from public.projects pr where pr.owner_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles r on r.user_id = p.id
  left join public.user_suspensions s on s.user_id = p.id
  where coalesce(btrim(search), '') = ''
     or p.display_name ilike '%' || btrim(search) || '%'
     or u.email ilike '%' || btrim(search) || '%'
  order by p.created_at desc
  limit least(greatest(coalesce(max_rows, 100), 1), 200);
end;
$$;

revoke all on function public.admin_list_users(text, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer) to authenticated;

create or replace function public.admin_set_user_suspended(
  target_user_id uuid,
  suspend boolean,
  suspend_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Solo los administradores pueden moderar usuarios.'
      using errcode = '42501';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'No puedes suspender tu propia cuenta.';
  end if;
  if exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role = 'admin'
  ) then
    raise exception 'No se puede suspender a otro administrador.';
  end if;

  if suspend then
    insert into public.user_suspensions (user_id, reason, suspended_by)
    values (target_user_id, nullif(btrim(suspend_reason), ''), (select auth.uid()))
    on conflict (user_id) do update
      set reason = excluded.reason,
          suspended_by = excluded.suspended_by,
          suspended_at = now();
  else
    delete from public.user_suspensions where user_id = target_user_id;
    insert into public.notifications (user_id, type, payload)
    values (target_user_id, 'moderation', jsonb_build_object('action', 'reinstated'));
  end if;
end;
$$;

revoke all on function public.admin_set_user_suspended(uuid, boolean, text)
  from public, anon;
grant execute on function public.admin_set_user_suspended(uuid, boolean, text)
  to authenticated;

-- Los admins también pueden borrar la imagen de un anuncio que eliminan.
drop policy if exists "Admins can delete project images" on storage.objects;
create policy "Admins can delete project images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'project-images' and (select public.is_admin()));

-- ═══════════ 4. Bandeja de notificaciones ═══════════
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'project_interest', 'invitation', 'invitation_response', 'message', 'moderation'
  ));

-- La persona puede vaciar su propia bandeja.
grant delete on public.notifications to authenticated;
drop policy if exists "Users can delete their notifications" on public.notifications;
create policy "Users can delete their notifications"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nueva invitación → aviso para quien la recibe.
create or replace function public.notify_invitation_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (
    new.receiver_id,
    'invitation',
    jsonb_build_object(
      'invitation_id', new.id,
      'sender_id', new.sender_id,
      'sender_name',
        (select display_name from public.profiles where id = new.sender_id)
    )
  );
  return new;
end;
$$;

revoke all on function public.notify_invitation_created() from public, anon, authenticated;
drop trigger if exists notify_invitation_created on public.invitations;
create trigger notify_invitation_created
  after insert on public.invitations
  for each row execute function public.notify_invitation_created();

-- Invitación aceptada o rechazada → aviso para quien la envió.
create or replace function public.notify_invitation_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    insert into public.notifications (user_id, type, payload)
    values (
      new.sender_id,
      'invitation_response',
      jsonb_build_object(
        'invitation_id', new.id,
        'receiver_id', new.receiver_id,
        'receiver_name',
          (select display_name from public.profiles where id = new.receiver_id),
        'status', new.status
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_invitation_answered() from public, anon, authenticated;
drop trigger if exists notify_invitation_answered on public.invitations;
create trigger notify_invitation_answered
  after update of status on public.invitations
  for each row execute function public.notify_invitation_answered();

-- Nuevo interesado en un anuncio → aviso para su autor.
create or replace function public.notify_project_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row record;
begin
  select id, owner_id, title into project_row
  from public.projects where id = new.project_id;

  if project_row.id is not null and project_row.owner_id <> new.user_id then
    insert into public.notifications (user_id, type, payload)
    values (
      project_row.owner_id,
      'project_interest',
      jsonb_build_object(
        'project_id', project_row.id,
        'project_title', project_row.title,
        'user_id', new.user_id,
        'user_name',
          (select display_name from public.profiles where id = new.user_id)
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_project_interest() from public, anon, authenticated;
drop trigger if exists notify_project_interest on public.project_interests;
create trigger notify_project_interest
  after insert on public.project_interests
  for each row execute function public.notify_project_interest();

-- Un admin oculta o elimina un anuncio ajeno → aviso para su autor.
create or replace function public.notify_project_moderated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.owner_id is distinct from (select auth.uid()) and (select public.is_admin()) then
      insert into public.notifications (user_id, type, payload)
      values (
        old.owner_id,
        'moderation',
        jsonb_build_object('action', 'deleted', 'project_title', old.title)
      );
    end if;
    return old;
  end if;

  if new.status = 'archived' and old.status is distinct from 'archived'
     and new.owner_id is distinct from (select auth.uid())
     and (select public.is_admin()) then
    insert into public.notifications (user_id, type, payload)
    values (
      new.owner_id,
      'moderation',
      jsonb_build_object(
        'action', 'hidden',
        'project_id', new.id,
        'project_title', new.title
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_project_moderated() from public, anon, authenticated;
drop trigger if exists notify_project_moderated_update on public.projects;
create trigger notify_project_moderated_update
  after update of status on public.projects
  for each row execute function public.notify_project_moderated();
drop trigger if exists notify_project_moderated_delete on public.projects;
create trigger notify_project_moderated_delete
  before delete on public.projects
  for each row execute function public.notify_project_moderated();

-- Avisos en vivo: la app se actualiza sin recargar.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table public.notifications;
    else
      raise exception 'Supabase Realtime publication is missing.';
    end if;
  end if;
end;
$$;

commit;
