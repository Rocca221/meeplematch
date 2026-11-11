-- Asistente de IA: límite diario de uso y registro (auditoría) de las acciones
-- que el asistente ejecuta en nombre de cada usuario.
-- Ejecutar una sola vez en Supabase → SQL Editor. Es seguro repetirlo.
begin;

create table if not exists public.assistant_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  requests integer not null default 0,
  primary key (user_id, day)
);

create table if not exists public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tool text not null,
  summary text not null,
  input jsonb not null default '{}'::jsonb,
  status text not null check (status in ('ok', 'error', 'rejected')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists assistant_actions_user_created_at_idx
  on public.assistant_actions (user_id, created_at desc);

alter table public.assistant_usage enable row level security;
alter table public.assistant_actions enable row level security;

revoke all on table public.assistant_usage, public.assistant_actions
  from anon, authenticated;

-- Cada persona puede ver (no editar) lo que el asistente hizo en su cuenta.
grant select on public.assistant_actions to authenticated;

drop policy if exists "Users can view their assistant actions"
  on public.assistant_actions;
create policy "Users can view their assistant actions"
  on public.assistant_actions for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.assistant_bump_usage(
  p_user uuid,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requests integer;
begin
  insert into public.assistant_usage (user_id, day, requests)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set requests = public.assistant_usage.requests + 1
  returning requests into v_requests;

  return v_requests <= p_limit;
end;
$$;

revoke all on function public.assistant_bump_usage(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.assistant_bump_usage(uuid, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
