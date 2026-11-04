begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name varchar(80) not null,
  bio varchar(500) not null default '',
  city varchar(120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  bgg_id bigint unique check (bgg_id is null or bgg_id > 0),
  name varchar(160) not null check (length(btrim(name)) > 0),
  description text not null default '',
  min_players smallint check (min_players is null or min_players > 0),
  max_players smallint check (max_players is null or max_players > 0),
  playing_time_minutes smallint check (
    playing_time_minutes is null or playing_time_minutes > 0
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    min_players is null
    or max_players is null
    or max_players >= min_players
  )
);

create table public.user_games (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  status text not null default 'owned'
    check (status in ('owned', 'wishlist', 'played')),
  rating smallint check (rating is null or rating between 1 and 10),
  notes varchar(500) not null default '',
  added_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title varchar(120) not null check (length(btrim(title)) > 0),
  description text not null check (length(btrim(description)) > 0),
  location varchar(120),
  desired_players smallint check (
    desired_players is null or desired_players > 0
  ),
  status text not null default 'open'
    check (status in ('draft', 'open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_interests (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (
    (status = 'pending' and responded_at is null)
    or (status in ('accepted', 'declined') and responded_at is not null)
  ),
  check (sender_id <> receiver_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique
    references public.invitations (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body varchar(4000) not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('project_interest', 'invitation', 'message')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

create index user_games_game_id_idx on public.user_games (game_id);
create index projects_owner_id_idx on public.projects (owner_id);
create index projects_status_created_at_idx
  on public.projects (status, created_at desc);
create index project_interests_user_id_idx
  on public.project_interests (user_id);
create unique index invitations_active_pair_idx
  on public.invitations (
    least(sender_id, receiver_id),
    greatest(sender_id, receiver_id)
  )
  where status in ('pending', 'accepted');
create index invitations_receiver_status_idx
  on public.invitations (receiver_id, status);
create index conversation_members_user_id_idx
  on public.conversation_members (user_id);
create index messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at desc);
create index notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_display_name text;
begin
  new_display_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Meeple'
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (new.id, new_display_name)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create or replace function public.set_invitation_responded_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.responded_at := case
      when new.status in ('accepted', 'declined') then now()
      else null
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.set_invitation_responded_at()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger invitations_set_responded_at
  before update on public.invitations
  for each row execute function public.set_invitation_responded_at();

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

insert into public.profiles (id, display_name)
select
  id,
  left(
    coalesce(
      nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(email, ''), '@', 1), ''),
      'Meeple'
    ),
    80
  )
from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'user'
from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.games enable row level security;
alter table public.user_games enable row level security;
alter table public.projects enable row level security;
alter table public.project_interests enable row level security;
alter table public.invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

revoke all on table
  public.profiles,
  public.user_roles,
  public.games,
  public.user_games,
  public.projects,
  public.project_interests,
  public.invitations,
  public.conversations,
  public.conversation_members,
  public.messages,
  public.notifications,
  public.push_tokens
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, bio, city, avatar_url)
  on public.profiles to authenticated;
grant select on public.games to authenticated;
grant insert, update, delete on public.games to authenticated;
grant select, insert, update, delete on public.user_games to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, delete on public.project_interests to authenticated;
grant update (status) on public.project_interests to authenticated;
grant select, insert, delete on public.invitations to authenticated;
grant update (status) on public.invitations to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy "Authenticated users can view profiles"
  on public.profiles for select to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create policy "Authenticated users can view games"
  on public.games for select to authenticated
  using (true);

create policy "Admins can manage games"
  on public.games for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Users can view their own library"
  on public.user_games for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can add games to their own library"
  on public.user_games for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own library"
  on public.user_games for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can remove games from their own library"
  on public.user_games for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can view visible projects"
  on public.projects for select to authenticated
  using (
    status <> 'draft'
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "Users can create projects as themselves"
  on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners and admins can update projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));

create policy "Owners and admins can delete projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

create policy "Users can view relevant project interests"
  on public.project_interests for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.projects
      where projects.id = project_interests.project_id
        and projects.owner_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

create policy "Users can express interest as themselves"
  on public.project_interests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
      from public.projects
      where projects.id = project_interests.project_id
        and projects.status = 'open'
        and projects.owner_id <> (select auth.uid())
    )
  );

create policy "Project owners can respond to interests"
  on public.project_interests for update to authenticated
  using (
    exists (
      select 1
      from public.projects
      where projects.id = project_interests.project_id
        and projects.owner_id = (select auth.uid())
    )
    or (select public.is_admin())
  )
  with check (
    exists (
      select 1
      from public.projects
      where projects.id = project_interests.project_id
        and projects.owner_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

create policy "Users can withdraw their interests"
  on public.project_interests for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.projects
      where projects.id = project_interests.project_id
        and projects.owner_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

create policy "Users can view their invitations"
  on public.invitations for select to authenticated
  using (
    sender_id = (select auth.uid())
    or receiver_id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "Users can send invitations as themselves"
  on public.invitations for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and receiver_id <> (select auth.uid())
    and status = 'pending'
  );

create policy "Receivers can respond to pending invitations"
  on public.invitations for update to authenticated
  using (receiver_id = (select auth.uid()) and status = 'pending')
  with check (
    receiver_id = (select auth.uid())
    and status in ('accepted', 'declined')
  );

create policy "Senders can cancel pending invitations"
  on public.invitations for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and status = 'pending'
  );

create policy "Participants can view their conversations"
  on public.conversations for select to authenticated
  using (
    exists (
      select 1
      from public.invitations
      where invitations.id = conversations.invitation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Participants can create conversations after acceptance"
  on public.conversations for insert to authenticated
  with check (
    exists (
      select 1
      from public.invitations
      where invitations.id = conversations.invitation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Participants can view conversation members"
  on public.conversation_members for select to authenticated
  using (
    exists (
      select 1
      from public.conversations
      join public.invitations
        on invitations.id = conversations.invitation_id
      where conversations.id = conversation_members.conversation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Participants can add members after acceptance"
  on public.conversation_members for insert to authenticated
  with check (
    exists (
      select 1
      from public.conversations
      join public.invitations
        on invitations.id = conversations.invitation_id
      where conversations.id = conversation_members.conversation_id
        and invitations.status = 'accepted'
        and conversation_members.user_id in (
          invitations.sender_id,
          invitations.receiver_id
        )
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Participants can view messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1
      from public.conversations
      join public.invitations
        on invitations.id = conversations.invitation_id
      where conversations.id = messages.conversation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Participants can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.conversations
      join public.invitations
        on invitations.id = conversations.invitation_id
      where conversations.id = messages.conversation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Recipients can mark messages as read"
  on public.messages for update to authenticated
  using (
    sender_id <> (select auth.uid())
    and read_at is null
    and exists (
      select 1
      from public.conversations
      join public.invitations
        on invitations.id = conversations.invitation_id
      where conversations.id = messages.conversation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and read_at is not null
    and exists (
      select 1
      from public.conversations
      join public.invitations
        on invitations.id = conversations.invitation_id
      where conversations.id = messages.conversation_id
        and invitations.status = 'accepted'
        and (select auth.uid()) in (
          invitations.sender_id,
          invitations.receiver_id
        )
    )
  );

create policy "Users can view their notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can mark their notifications as read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can manage their own push tokens"
  on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
