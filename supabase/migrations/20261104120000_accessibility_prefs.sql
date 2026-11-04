-- Preferencias de accesibilidad sincronizadas con la cuenta.
-- Es idempotente: se puede ejecutar más de una vez en Supabase > SQL Editor.
-- Las políticas RLS existentes de `profiles` ya limitan la edición a la propia fila.
alter table public.profiles
  add column if not exists accessibility_prefs jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_accessibility_prefs_is_object'
  ) then
    alter table public.profiles
      add constraint profiles_accessibility_prefs_is_object
      check (
        accessibility_prefs is null
        or (
          jsonb_typeof(accessibility_prefs) = 'object'
          and pg_column_size(accessibility_prefs) < 2048
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';
