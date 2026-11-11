# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Supabase setup

The app connects to Supabase through its HTTPS API; it must not connect directly
to the PostgreSQL host from a mobile client.

1. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`).
   Set `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project's publishable key
   from **Supabase Dashboard → Project Settings → API Keys**. The project URL is
   already set in the example.
2. In the Supabase Dashboard, open **SQL Editor**, paste the entire contents of
   `supabase/migrations/20261021103000_initial_schema.sql`, and run it once.
   This creates profiles, roles, games, libraries, projects, invitations, chat,
   notifications, and push-token tables with their row-level security policies.
   The migration replaces the existing `on_auth_user_created` trigger so it
   creates the profile using the schema defined here.
3. Restart Expo after editing `.env`:

   ```bash
   npx expo start --clear
   ```

4. To test the app on the computer in a browser, run:

   ```bash
   npx expo start --web
   ```

   Choose **Crear cuenta** and register with an email and a password of at
   least 8 characters. If email confirmation is enabled in Supabase, confirm the
   message first and then sign in. The home screen confirms the database
   connection when it successfully reads the new profile.

## Tablón, perfiles y catálogo propio de juegos

La aplicación usa el catálogo `public.games` de Supabase y no depende de la API
de BoardGameGeek. La migración inicial y la migración de perfiles/tablón ya
aplicadas no se deben ejecutar otra vez. Para añadir los metadatos del catálogo,
el almacenamiento de portadas y detener el cron anterior de BGG:

1. En **Supabase → SQL Editor**, ejecuta una sola vez el contenido completo de
   `supabase/migrations/20261021150000_local_game_catalog.sql`.
2. En **Supabase → Authentication → Users** o en la tabla `public.user_roles`,
   asegúrate de que tu cuenta tenga rol `admin` (el cambio de roles no se hace
   desde la aplicación):

   ```sql
   update public.user_roles
   set role = 'admin'
   where user_id = '<UUID de tu usuario en auth.users>';
   ```
3. En **Mis juegos**, una cuenta administradora puede dar de alta juegos con
   descripción, jugadores, duración, año, editorial y ruta de portada. Los
   usuarios buscan el catálogo local y agregan juegos a su colección con el
   estado “En mi colección”, “Ya lo jugué” o “Quiero jugarlo”.
4. Para portadas, sube archivos autorizados al bucket público `game-covers` en
   **Supabase → Storage** y guarda en el juego la ruta relativa dentro del
   bucket, por ejemplo `portadas/mi-juego.jpg`. No se consultan imágenes de BGG.
5. La migración desprograma el cron anterior. Si `sync-bgg` sigue desplegada,
   elimínala desde **Supabase → Edge Functions**; ya no se invoca desde la app.

El tablón permite publicar proyectos con objetivo de largo plazo y roles
buscados, expresar interés y enviar invitaciones. El chat solo se puede abrir
después de que el destinatario acepte la invitación; las políticas RLS de la
base también aplican esa restricción.

En **Mensajes → Buscar jugadores** puedes buscar por nombre y enviar una
solicitud de conexión. La otra persona debe aceptarla antes de que se habilite
el chat privado. Desde **Mi perfil** puedes cambiar tu foto, guardar la
preferencia de tema (sistema, claro u oscuro) y activar notificaciones en el
dispositivo.

En la pantalla de acceso puedes solicitar un enlace de recuperación de
contraseña y, al recibirlo, establecer una nueva. Si el correo de confirmación
de una cuenta nueva no llegó, la pantalla también permite reenviarlo.

Para que los enlaces de validación y recuperación vuelvan a la app, en
**Supabase → Authentication → URL Configuration → Redirect URLs** agrega los
destinos de tu entorno:

- Web local: `http://localhost:*/**` (o el origen exacto que muestra Expo).
- Expo Go: `exp://**`.
- Aplicación instalada: `meeplereal://**`.
- Sitio web publicado: su origen HTTPS, por ejemplo `https://tu-dominio.com/**`.

El destino del sitio web (Site URL) debe ser el dominio web publicado cuando
esté disponible. Si la validación da error, confirma que el correo se usa desde
el mismo entorno/origen autorizado y vuelve a enviar el correo desde la app.

En el tablón puedes buscar por texto y combinar filtros por juego, zona,
rol, experiencia del anfitrión y cantidad mínima de jugadores. La biblioteca
permite buscar por nombre, filtrar por estado, consultar los detalles del juego
y ver portadas desde el almacenamiento propio.

### Portadas de juegos, perfiles públicos y chat en vivo

1. Para que el administrador suba una portada desde **Mis juegos**, la
   migración `20261021150000_local_game_catalog.sql` debe estar aplicada. En el
   formulario del catálogo usa **Elegir imagen**; admite JPG, PNG y WebP de
   hasta 8 MB, y guarda la ficha para aplicar la portada.
2. Ejecuta una sola vez en **Supabase → SQL Editor** el archivo
   `supabase/migrations/20261026190000_player_previews_chat_realtime.sql`.
   Está en la carpeta `supabase/migrations/` de la raíz del proyecto; no dentro
   de la carpeta de plantilla anidada `MeepleREAL\`.
   Este habilita el canal Realtime de mensajes y una función que devuelve los
   datos lúdicos necesarios para la vista previa del jugador sin exponer notas
   privadas de su biblioteca.
3. Las bibliotecas y preferencias lúdicas son visibles para otros usuarios
   autenticados al abrir la vista previa. La función solo devuelve nombre,
   descripción, portada y estado del juego; no comparte notas ni calificaciones.

En **Mensajes**, toca la tarjeta o la foto de un jugador para abrir **Ver perfil**:
allí se muestran su presentación, ubicación, experiencia, preferencias y juegos
separados entre colección, ya jugados y pendientes. Desde esa vista puedes enviar
la solicitud de conexión. Las conversaciones abiertas reciben mensajes nuevos
en tiempo real una vez aplicada la migración anterior.

El favicon del sitio web se genera desde `img/meeple.png` y se sirve como
`public/favicon.ico` para que tanto Expo Web como el sitio publicado lo resuelvan
en la ruta estándar `/favicon.ico`. Tras desplegarlo, fuerza la recarga del sitio
o limpia el favicon guardado en la caché del navegador.

En **Mi perfil → Perfil lúdico**, elige los estilos de juego mediante opciones
seleccionables o agrega etiquetas propias. Las preferencias personalizadas
guardadas anteriormente se conservan y también se pueden quitar desde esa lista.

### Idioma, ubicación y sesión

- En la pantalla de acceso o en **Mi perfil → Idioma**, cambia entre español e
  inglés. La selección se guarda en el dispositivo.
- Al editar **Ciudad o zona**, escribe al menos tres caracteres y selecciona una
  sugerencia geográfica. Las sugerencias usan Photon/OpenStreetMap, sin clave de
  API; el texto de búsqueda se consulta al servicio externo. Al pulsar **Abrir en
  Google Maps**, se abre la ubicación seleccionada en Maps. También puedes abrir
  la ubicación escrita aunque no selecciones una sugerencia.
- El formulario de publicaciones del tablón y su filtro de zona comparten las
  sugerencias de Photon. En Inicio, el carrusel muestra anuncios abiertos cuya
  ubicación coincide textualmente con la ciudad/zona del perfil; no calcula
  distancia en kilómetros porque el esquema no guarda coordenadas.
- Las publicaciones aceptan una imagen JPG, PNG o WebP de hasta 8 MB. Para
  habilitar la columna y el bucket con políticas de propietario, ejecuta una
  sola vez el SQL completo de
  `supabase/migrations/20261028103000_project_images.sql` en Supabase → SQL
  Editor. La portada `img/boardgames.png` se muestra como alternativa en el
  carrusel cuando el anuncio no tiene imagen.
- Las imágenes de las mesas se recortan automáticamente al centro en 16:9 (y se
  reducen a 1280 px de ancho en web) para que no se vean deformadas.
- Al publicar una mesa puedes elegir un juego **del catálogo** o
  **personalizado** y escribir el nombre del tuyo. Para habilitarlo y cargar 29
  juegos de ejemplo con descripción y portada, ejecuta una sola vez en
  **Supabase → SQL Editor** el archivo
  `supabase/migrations/20261104100000_catalog_seed_custom_game.sql` (es
  idempotente) **antes** de recargar la app: agrega la columna
  `projects.custom_game_name`, que Inicio y Tablón consultan.
- **Cerrar sesión** está disponible en Inicio y en Mi perfil.

### Accesibilidad

MeepleMatch incluye un **centro de accesibilidad** en **Perfil → Accesibilidad**
(también desde el botón «Aa Accesibilidad» de la barra superior en web y desde
la pantalla de ingreso). Todo se aplica al instante y se guarda solo.

- **Texto:** tres tamaños fijos (normal 100 %, grande 125 %, muy grande 150 %).
  No hay valores intermedios para que ninguna pantalla se rompa; si el sistema
  operativo ya agranda la letra, se usa el tamaño permitido más cercano.
- **Contraste:** normal, alto y muy alto (bordes visibles, texto reforzado).
- **Daltonismo:** protanopía, deuteranopía, tritanopía y escala de grises. Los
  estados nunca dependen solo del color: llevan icono y texto.
- **Movimiento:** reducir animaciones; también respeta la preferencia del
  sistema operativo.
- **Controles grandes:** áreas de toque de 56 px en lugar de 44 px.
- **Teclado y lectores de pantalla:** foco visible, «saltar al contenido»,
  etiquetas accesibles, textos alternativos y ampliación de imágenes.
- **Sincronización:** las preferencias se guardan en el dispositivo y, si hay
  sesión, en tu cuenta. Para habilitar la sincronización ejecuta una sola vez
  en **Supabase → SQL Editor** el archivo
  `supabase/migrations/20261104120000_accessibility_prefs.sql` (idempotente).
  Sin ese paso la app funciona igual, solo con guardado local.

Código: `src/providers/accessibility-provider.tsx` (estado y persistencia),
`src/constants/palettes.ts` (paletas y contrastes) y
`src/components/accessibility-center.tsx` (pantalla de ajustes). Los
componentes compartidos `ThemedText`, `ThemedView`, `LocalizedTextInput` y
`accessible-pressable` aplican las preferencias a toda la app.

### Fotos de perfil y notificaciones push

Para habilitar la nueva subida de avatar y el envío seguro de notificaciones
push:

1. Ejecuta una sola vez en **Supabase → SQL Editor** el archivo
   `supabase/migrations/20261021170000_avatar_push_delivery.sql`. La foto se
   guarda en el bucket público `avatars`; cada usuario solo puede reemplazar
   su propio archivo.
2. Despliega la función que valida que el usuario pertenece a una conversación
   aceptada, guarda el mensaje y envía push a los dispositivos registrados:

   ```bash
   npx supabase@latest functions deploy send-message
   ```

3. Asocia el proyecto Expo a EAS desde la raíz del proyecto:

   ```bash
   npx eas-cli@latest init
   ```

   Esto agrega el identificador del proyecto que la app necesita para generar
   tokens push. Configura también las credenciales de notificación Android/iOS
   en EAS según la guía oficial de Expo.
4. Las notificaciones push remotas no funcionan en Expo Go para Android desde
   SDK 53. Para probarlas, instala el cliente de desarrollo y configura EAS
   Build:

   ```bash
   npx expo install expo-dev-client
   npx eas-cli@latest build:configure
   npx eas-cli@latest build --profile development --platform android
   ```

   Instala la compilación en un dispositivo físico; Expo Go sigue sirviendo
   para las otras pantallas y para elegir fotos.
5. En la app, cada usuario abre **Mi perfil → Notificaciones → Activar
   notificaciones** en cada dispositivo donde quiera recibir avisos.

La función `send-message` es el único camino de escritura de mensajes desde la
app; la migración revoca el `INSERT` directo de usuarios autenticados para que
la verificación de participantes y la notificación se ejecuten siempre juntas.
No agregues claves `service_role` ni contraseñas de PostgreSQL al cliente.

After registering the account that will administer the app, assign its UUID the
`admin` role from the SQL Editor:

```sql
update public.user_roles
set role = 'admin'
where user_id = '<UUID from auth.users>';
```

Role changes are intentionally not available through the mobile client.

Never put the PostgreSQL password, a secret API key, or the `service_role` key
in the app or any `EXPO_PUBLIC_*` variable. The publishable key is intended for
client use; row-level security protects the database.

## Asistente de IA (agente)

El botón flotante **✦** (abajo a la derecha, en todas las pantallas) abre un
asistente que **actúa** dentro de la app, no solo conversa: consulta datos,
los analiza y ejecuta acciones con herramientas sobre la cuenta de la persona.

**Qué puede hacer** (25 herramientas):

| Tipo | Herramientas |
| --- | --- |
| Consultar | perfil, catálogo de juegos, biblioteca, Tablón, mis publicaciones e interesados, jugadores, invitaciones, notificaciones, lectura de un chat |
| Analizar | `analyze_library` (estadísticas, huecos y sugerencias), `recommend_projects` (puntúa publicaciones según biblioteca, ciudad y gustos) |
| Cargar datos | `add_games_to_library` (carga masiva), `update_my_profile`, `add_game_to_catalog` (solo administradores) |
| Actuar | crear/editar/eliminar publicaciones, mostrar interés, responder solicitudes, enviar y responder invitaciones, escribir por chat, marcar notificaciones como leídas |

**Seguridad (por diseño)**
- La clave de Groq vive solo en el servidor (secreto de Supabase). El cliente
  nunca la ve.
- Todas las herramientas corren con el **JWT del propio usuario**: las políticas
  RLS siguen mandando, así que el asistente no puede hacer más que la persona.
- Confirmación en la app: las acciones **públicas, destructivas o que afectan a
  otras personas** (publicar, borrar, invitar, escribir, responder solicitudes)
  se detienen y piden *Aprobar / Rechazar*. Las de bajo riesgo (cargar juegos,
  editar el perfil, guardar un borrador, marcar notificaciones) se ejecutan solas,
  salvo que se active "Pedir confirmación para todas las acciones".
- Los textos escritos por otras personas (publicaciones, perfiles, mensajes) se
  tratan como datos, no como instrucciones (defensa contra *prompt injection*).
- Límite diario por usuario (`ASSISTANT_DAILY_LIMIT`, 120 por defecto) y
  **historial de auditoría** (`assistant_actions`) visible en el panel.

**Modelo de IA: Groq (plan gratuito)**
La función usa la API de Groq, compatible con OpenAI y con *tool calling*. Por
defecto prueba, en orden, `meta-llama/llama-4-scout-17b-16e-instruct`,
`llama-3.3-70b-versatile` y `openai/gpt-oss-20b`: si uno agota su cuota por
minuto o ya no existe, pasa al siguiente. Los nombres y límites gratuitos
cambian con frecuencia; revisa <https://console.groq.com/docs/models> y
<https://console.groq.com/docs/rate-limits>. Para fijar otros modelos:
`npx supabase@latest secrets set ASSISTANT_MODELS=modelo1,modelo2`.

**Puesta en marcha**
1. Ejecuta `supabase/migrations/20261104150000_assistant.sql` en el SQL Editor.
2. Crea una clave gratuita en <https://console.groq.com/keys> y guárdala como
   secreto (nunca en la app ni en `.env`):

   ```bash
   npx supabase@latest login
   npx supabase@latest secrets set GROQ_API_KEY=gsk_...
   ```
3. Despliega la función:

   ```bash
   npx supabase@latest functions deploy assistant
   ```
4. Recompila el APK (`npm run build:apk`) para que lleve el botón del asistente.

El plan gratuito tiene límites por minuto y por día (compartidos por toda tu
cuenta de Groq). Si se agotan, la app muestra un aviso y se puede reintentar
más tarde; para una demo conviene probar el flujo completo antes.

Código: `supabase/functions/assistant/` (`agent.ts` bucle del agente,
`tools.ts` herramientas, `index.ts` HTTP/auth/modelo) y, en la app,
`src/providers/assistant-provider.tsx` + `src/components/assistant-launcher.tsx`.

## Novedades: duración de anuncios, avisos, moderación y sitio público

### 1. Aplicar la migración (una sola vez)

En **Supabase → SQL Editor**, pega y ejecuta el contenido completo de
`supabase/migrations/20261110120000_expiry_notifications_moderation.sql`. Agrega:

- **Duración de anuncios**: columna `projects.expires_at`. Al vencer, el anuncio
  deja de verse para los demás (lo aplica la base de datos); su autor lo sigue
  viendo y puede renovarlo editándolo.
- **Borrado**: el autor puede eliminar su anuncio (y el administrador, cualquiera).
- **Avisos**: la tabla `notifications` ahora también se llena sola cuando alguien
  te invita, responde tu invitación, se interesa en tu anuncio o un administrador
  modera tu contenido. Se actualizan en vivo (Realtime).
- **Moderación**: tabla `user_suspensions` y funciones `admin_list_users` /
  `admin_set_user_suspended`, que solo ejecutan administradores. Un usuario
  suspendido no puede publicar, mostrar interés ni invitar.

Después publica de nuevo la función de chat para que también respete las
suspensiones:

```bash
npx supabase functions deploy send-message
```

### 2. Cómo se usa

- **Tablón**: en *+ Publicar* eliges cuántos días queda abierto (o «Sin límite»).
  En cada anuncio propio hay un botón **Eliminar** con confirmación.
- **Avisos**: en web, botón *Avisos* de la barra superior (con contador); en el
  celular, botón *Avisos* en Inicio.
- **Admin** (solo administradores): botón *Admin* en la misma barra / en Inicio.
  Permite suspender o reactivar usuarios y ocultar, volver a mostrar o eliminar
  anuncios. Para volver administrador a una cuenta, desde el SQL Editor:

  ```sql
  update public.user_roles set role = 'admin'
  where user_id = (select id from auth.users where email = 'admin.prueba@meeplematch.app');
  ```

### 3. Cuentas de prueba y sitio público

El sitio de presentación está en `public/sitio/index.html` (un solo archivo, sin
dependencias). Con `npx expo start --web` se ve en `/sitio/index.html`; también
puedes subirlo tal cual a cualquier hosting estático.

Las credenciales que muestra **hay que crearlas** una vez. Los pasos y el SQL
están en `supabase/test-accounts.sql`:

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Usuario estándar | `usuario.prueba@meeplematch.app` | `Prueba#2026` |
| Administrador | `admin.prueba@meeplematch.app` | `Admin#2026` |

Si prefieres otras, cámbialas también en `public/sitio/index.html` y en el SQL.
Usa solo cuentas de demostración: las credenciales son públicas.

### Activar el botón de descarga del APK

En `public/sitio/index.html`, al final del archivo, hay un bloque `CONFIG`:

```js
var CONFIG = {
  apkUrl: '',   // enlace directo al .apk
  webUrl: ''    // dirección de la app web, si existe
};
```

Pega ahí el enlace y los botones «Descargar APK» se activan solos (mientras esté
vacío dicen «APK próximamente»).

## Descargar la app (APK)

**Descarga directa:** <https://github.com/Rocca221/meeplematch/releases/latest/download/meeplematch.apk>

**Sitio público:** <https://rocca221.github.io/meeplematch/>

Cómo publicar el APK de forma permanente (el enlace de EAS vence):

1. Descarga el `.apk` terminado desde <https://expo.dev> → tu proyecto → *Builds*
   y renómbralo `meeplematch.apk`.
2. En GitHub: repositorio → *Releases* → *Draft a new release* → crea una etiqueta
   (por ejemplo `v1.0.0`) → arrastra `meeplematch.apk` → *Publish release*.
3. El enlace `.../releases/latest/download/meeplematch.apk` siempre apunta a la
   última versión. Pégalo arriba y en `CONFIG.apkUrl` del sitio.

Para instalarlo, el celular pedirá permitir «instalar apps de orígenes
desconocidos» solo para esa descarga.

## Jerarquía de pantallas

La navegación tiene **dos niveles** y se decide por la sesión. Los grupos entre
paréntesis son solo carpetas: no cambian las URLs (`/`, `/explore`, ...).

```
src/app/
├─ _layout.tsx        Raíz: providers globales + pantalla de carga
├─ (auth)/            NIVEL 0 · sin sesión
│  ├─ _layout.tsx     Con sesión te manda a la app
│  └─ sign-in.tsx     Ingresar / Crear cuenta / Olvidé mi contraseña / Contraseña nueva
└─ (app)/             NIVEL 1 · con sesión
   ├─ _layout.tsx     Sin sesión te manda a /sign-in · pestañas + asistente
   ├─ index.tsx       Inicio
   ├─ explore.tsx     Tablón
   ├─ library.tsx     Juegos
   ├─ messages.tsx    Chat
   └─ profile.tsx     Perfil (incluye Accesibilidad)
```

Reglas para mantenerla clara:

- Una pantalla nueva con sesión va en `src/app/(app)/`; una sin sesión, en `src/app/(auth)/`.
- El detalle de un elemento (juego, proyecto, conversación) se abre como panel
  dentro de su pestaña, no como una pantalla más; así siempre se sabe en qué
  pestaña se está.
- Barra superior (web) y pestañas inferiores (celular) muestran las mismas cinco
  secciones en el mismo orden.

## Instalar MeepleMatch en el celular (APK Android)

La app se compila en la nube con **EAS Build** (no hace falta Android Studio).
El resultado es un `.apk` que se instala sin Expo Go y sin tu PC encendida.

1. **Cuenta y dependencias** (una vez): crea una cuenta gratuita en
   <https://expo.dev/signup>. Desde la carpeta del proyecto:

   ```bash
   npm install
   npx eas-cli@latest login
   npx eas-cli@latest init        # crea el proyecto en EAS y agrega extra.eas.projectId a app.json
   ```

2. **Revisión previa** (opcional pero recomendada):

   ```bash
   npx tsc --noEmit
   npx expo lint
   npx expo-doctor@latest
   ```

3. **Supabase → Authentication → URL Configuration → Redirect URLs**: agrega
   `meeplematch://auth/callback` para que los enlaces de confirmación de correo
   y de recuperación de contraseña abran la app instalada.
4. **Compilar el APK** (tarda ~10–20 min en la cola gratuita):

   ```bash
   npm run build:apk
   ```

   `eas.json` ya define el perfil `preview` (genera `.apk`) y las variables
   `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. El archivo
   `.env` **no** se sube a EAS, por eso las variables están en `eas.json`
   (la clave *publishable* es pública por diseño; nunca pongas aquí la
   `service_role`).
5. **Instalar**: al terminar, EAS muestra un enlace y un código QR. Ábrelo desde
   el celular, descarga el `.apk` y permite "instalar apps de orígenes
   desconocidos" cuando Android lo pida.
6. **Notificaciones push en el APK (opcional)**: Android exige Firebase (FCM).
   Crea un proyecto en <https://console.firebase.google.com>, registra la app
   Android con el paquete `com.meeplematch.app`, y sube la credencial *FCM V1*
   con `npx eas-cli@latest credentials` (Android → *Google Service Account Key
   for Push Notifications*). Descarga `google-services.json`, guárdalo en la
   raíz y agrega en `app.json` → `expo.android.googleServicesFile`:
   `"./google-services.json"`; vuelve a compilar. Sin esto la app funciona igual
   y las notificaciones se ven dentro de la app; solo el aviso push del sistema
   queda desactivado.
7. **Actualizar la app**: vuelve a ejecutar `npm run build:apk` e instala el nuevo
   `.apk` encima del anterior (conserva la sesión y los datos).

Para publicar en Google Play usa el perfil `production` (genera `.aab`):
`npx eas-cli@latest build --platform android --profile production`.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Acceso con Google y cambio de contraseña

- **Continuar con Google**: botón en la pantalla de acceso (`src/components/auth-screen.tsx`). La lógica está en `src/lib/google-auth.ts` y el retorno del navegador se procesa en `src/lib/auth-url.ts`.
- **Cambiar contraseña**: tarjeta en Perfil (`src/components/change-password-card.tsx`). Verifica la contraseña actual; si la cuenta entró solo con Google, permite crear una.
- Configuración necesaria: proveedor Google en Supabase (Authentication → Providers) y las URL de retorno en Authentication → URL Configuration: `meeplematch://auth/callback`, `exp://**` (Expo Go) y el origen web.
- Migración `20261110150000_google_profile_names.sql`: el perfil nuevo toma el nombre que entrega Google.
