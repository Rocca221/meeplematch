begin;

alter table public.profiles
  add column experience_level text not null default 'beginner'
    check (experience_level in ('beginner', 'casual', 'experienced', 'expert')),
  add column preferred_game_types text[] not null default '{}',
  add column bgg_username varchar(100),
  add column bgg_synced_at timestamptz,
  add column bgg_sync_attempted_at timestamptz;

create unique index profiles_bgg_username_lower_idx
  on public.profiles (lower(bgg_username))
  where bgg_username is not null;

alter table public.projects
  add column long_term_goal text not null default '',
  add column roles_needed text[] not null default '{}',
  add column game_id uuid references public.games (id) on delete set null;

alter table public.user_games
  add column bgg_synced boolean not null default false;

create index projects_game_id_idx on public.projects (game_id);
create index user_games_bgg_synced_idx
  on public.user_games (user_id, bgg_synced);

grant update (experience_level, preferred_game_types, bgg_username)
  on public.profiles to authenticated;

grant update (long_term_goal, roles_needed, game_id)
  on public.projects to authenticated;

create or replace function public.sync_bgg_collection(
  target_user_id uuid,
  collection jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  imported_count integer;
begin
  if jsonb_typeof(collection) is distinct from 'array' then
    raise exception 'BGG collection must be a JSON array';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_user_id
      and bgg_username is not null
  ) then
    raise exception 'No BGG username is linked to this profile';
  end if;

  insert into public.games (
    bgg_id,
    name,
    min_players,
    max_players,
    playing_time_minutes,
    metadata
  )
  select
    (item ->> 'bgg_id')::bigint,
    left(item ->> 'name', 160),
    nullif(item ->> 'min_players', '')::smallint,
    nullif(item ->> 'max_players', '')::smallint,
    nullif(item ->> 'playing_time_minutes', '')::smallint,
    coalesce(item -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(collection) as entry(item)
  where coalesce(item ->> 'bgg_id', '') ~ '^[1-9][0-9]*$'
    and nullif(btrim(item ->> 'name'), '') is not null
  on conflict (bgg_id) do update
    set name = excluded.name,
        min_players = excluded.min_players,
        max_players = excluded.max_players,
        playing_time_minutes = excluded.playing_time_minutes,
        metadata = excluded.metadata;

  insert into public.user_games (user_id, game_id, status, rating, bgg_synced)
  select
    target_user_id,
    games.id,
    'owned',
    case
      when coalesce(item ->> 'rating', '') ~ '^[0-9]+(\.[0-9]+)?$'
        then round((item ->> 'rating')::numeric)::smallint
      else null
    end,
    true
  from jsonb_array_elements(collection) as entry(item)
  join public.games
    on games.bgg_id = (item ->> 'bgg_id')::bigint
  where coalesce(item ->> 'bgg_id', '') ~ '^[1-9][0-9]*$'
    and nullif(btrim(item ->> 'name'), '') is not null
  on conflict (user_id, game_id) do update
    set bgg_synced = true;

  get diagnostics imported_count = row_count;

  delete from public.user_games
  where user_id = target_user_id
    and bgg_synced
    and not exists (
      select 1
      from jsonb_array_elements(collection) as entry(item)
      where coalesce(item ->> 'bgg_id', '') ~ '^[1-9][0-9]*$'
        and (item ->> 'bgg_id')::bigint = (
          select games.bgg_id
          from public.games
          where games.id = user_games.game_id
        )
    );

  update public.profiles
  set bgg_synced_at = now()
  where id = target_user_id;

  return imported_count;
end;
$$;

revoke all on function public.sync_bgg_collection(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_bgg_collection(uuid, jsonb)
  to service_role;

commit;
