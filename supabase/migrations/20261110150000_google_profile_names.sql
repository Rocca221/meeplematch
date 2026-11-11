-- Al registrarse con Google, Supabase guarda el nombre en raw_user_meta_data
-- como "full_name" / "name" (no como "display_name"). Se aprovechan para que el
-- perfil nuevo salga con el nombre real de la persona.
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
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
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
