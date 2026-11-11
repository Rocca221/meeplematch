-- Cuentas de prueba para la defensa / el sitio público (public/sitio).
--
-- PASO 1 (en el panel, NO en SQL): Supabase -> Authentication -> Users -> Add user
--   -> "Create new user", con "Auto Confirm User" activado:
--     usuario.prueba@meeplematch.app   /  Prueba#2026
--     admin.prueba@meeplematch.app     /  Admin#2026
--   El trigger handle_new_user() crea automáticamente el perfil y el rol 'user'.
--
-- PASO 2 (SQL Editor): ejecuta este archivo. Da rol admin a la cuenta de
-- administración, le pone nombre visible a ambas y muestra el resultado.

update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'admin.prueba@meeplematch.app');

update public.profiles set display_name = 'Jugador de prueba'
where id = (select id from auth.users where email = 'usuario.prueba@meeplematch.app');

update public.profiles set display_name = 'Admin de prueba'
where id = (select id from auth.users where email = 'admin.prueba@meeplematch.app');

-- Verificación: deben aparecer 2 filas, una 'user' y una 'admin'.
select u.email, r.role, p.display_name, u.email_confirmed_at is not null as confirmado
from auth.users u
join public.user_roles r on r.user_id = u.id
join public.profiles p on p.id = u.id
where u.email in ('usuario.prueba@meeplematch.app', 'admin.prueba@meeplematch.app')
order by r.role;
