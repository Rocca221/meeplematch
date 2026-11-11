begin;

create or replace function public.get_player_preview(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile',
    (
      select jsonb_build_object(
        'id', profiles.id,
        'display_name', profiles.display_name,
        'bio', profiles.bio,
        'city', profiles.city,
        'avatar_url', profiles.avatar_url,
        'experience_level', profiles.experience_level,
        'preferred_game_types', profiles.preferred_game_types
      )
      from public.profiles
      where profiles.id = target_user_id
    ),
    'games',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', games.id,
            'name', games.name,
            'description', games.description,
            'cover_path', games.cover_path,
            'status', user_games.status
          )
          order by games.name
        )
        from public.user_games
        join public.games on games.id = user_games.game_id
        where user_games.user_id = target_user_id
      ),
      '[]'::jsonb
    )
  )
  where (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where profiles.id = target_user_id
    );
$$;

revoke all on function public.get_player_preview(uuid) from public, anon;
grant execute on function public.get_player_preview(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    if exists (
      select 1
      from pg_catalog.pg_publication
      where pubname = 'supabase_realtime'
    ) then
      alter publication supabase_realtime add table public.messages;
    else
      raise exception 'Supabase Realtime publication is missing.';
    end if;
  end if;
end;
$$;

commit;
