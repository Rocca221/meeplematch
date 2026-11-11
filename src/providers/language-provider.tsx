import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type AppLanguage = 'es' | 'en';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  translate: (text: string) => string;
  storageError: string;
};

const STORAGE_KEY = 'meeplematch.language';
const LanguageContext = createContext<LanguageContextValue | null>(null);

const ENGLISH_TRANSLATIONS: Record<string, string> = {
  'Inicio': 'Home',
  'Cargando': 'Loading',
  'Jugador': 'Player',
  'Tú': 'You',
  '✕ Quitar filtros': '✕ Clear filters',
  'Todos los campos son obligatorios.': 'All fields are required.',
  'Ver detalles →': 'View details →',
  'Buscar en mi biblioteca': 'Search my library',
  'Los campos marcados con * son obligatorios.': 'Fields marked with * are required.',
  'Ajustes de accesibilidad ↓': 'Accessibility settings ↓',
  'Accesibilidad': 'Accessibility',
  'Tablón': 'Board',
  'Juegos': 'Games',
  'Chat': 'Chat',
  'Perfil': 'Profile',
  'TU IDENTIDAD COMO JUGADOR': 'YOUR GAMER IDENTITY',
  'COMUNIDAD MEEPLEMATCH': 'MEEPLEMATCH COMMUNITY',
  'MEEPLEMATCH': 'MEEPLEMATCH',
  'Mi perfil': 'My profile',
  'Comparte tus gustos para encontrar tu mesa ideal.': 'Share your interests to find your ideal gaming group.',
  'Cambiar foto': 'Change photo',
  'Cambiar': 'Change',
  'Subiendo...': 'Uploading...',
  'Perfil lúdico': 'Gaming profile',
  'Nombre visible': 'Display name',
  'Nombre de jugador': 'Player name',
  'Sobre mí': 'About me',
  '¿Qué buscas en una mesa de juego?': 'What are you looking for in a gaming group?',
  'Ciudad o zona': 'City or area',
  'Ej. Buenos Aires': 'e.g. Buenos Aires',
  'Experiencia': 'Experience',
  'Estoy empezando': 'Just starting',
  'Casual': 'Casual',
  'Con experiencia': 'Experienced',
  'Experto/a': 'Expert',
  'Está empezando': 'Just starting',
  'Experto': 'Expert',
  'Estilos de juego que prefieres': 'Preferred game styles',
  'Selecciona los que te representan. También puedes agregar uno propio.': 'Select the styles that suit you. You can also add your own.',
  'party': 'Party',
  'Party': 'Party',
  'Rol': 'Role-playing',
  'Euro': 'Eurogame',
  'Push your luck': 'Push your luck',
  'Estrategia': 'Strategy',
  'Cooperativo': 'Cooperative',
  'Familiar': 'Family',
  'Abstracto': 'Abstract',
  'Narrativo': 'Narrative',
  'Deducción': 'Deduction',
  'Cartas': 'Card game',
  'Colocación de trabajadores': 'Worker placement',
  'Control de áreas': 'Area control',
  'rol': 'Role-playing',
  'wargame': 'Wargame',
  'euro': 'Eurogame',
  'estrategia': 'Strategy',
  'cooperativo': 'Cooperative',
  'familiar': 'Family',
  'abstracto': 'Abstract',
  'narrativo': 'Narrative',
  'deducción': 'Deduction',
  'cartas': 'Card game',
  'deckbuilding': 'Deck-building',
  'legacy': 'Legacy',
  'colocación de trabajadores': 'Worker placement',
  'control de áreas': 'Area control',
  'filler': 'Filler',
  'Otro estilo (puedes separar con comas)': 'Other style (separate with commas)',
  'Agregar': 'Add',
  'Apariencia': 'Appearance',
  'Elige cómo se verá MeepleMatch en este dispositivo.': 'Choose how MeepleMatch looks on this device.',
  'Seguir el dispositivo': 'Use device setting',
  'Tema claro': 'Light theme',
  'Tema oscuro': 'Dark theme',
  'Notificaciones': 'Notifications',
  'Recibe avisos cuando llegue un mensaje nuevo.': 'Get notified when a new message arrives.',
  'Activando...': 'Enabling...',
  'Guardar perfil': 'Save profile',
  'Guardando...': 'Saving...',
  'Perfil guardado correctamente.': 'Profile saved successfully.',
  'Foto de perfil actualizada.': 'Profile photo updated.',
  'Ubicación guardada': 'Location saved',
  'El nombre visible no puede quedar vacío.': 'Display name cannot be empty.',
  'El nombre visible puede tener hasta 80 caracteres.': 'Display name can be up to 80 characters long.',
  'La foto debe pesar menos de 8 MB.': 'The photo must be smaller than 8 MB.',
  'Elige una imagen JPG, PNG o WebP.': 'Choose a JPG, PNG, or WebP image.',
  'No se pudo leer la foto seleccionada.': 'Could not read the selected photo.',
  'No se pudo actualizar la foto de perfil.': 'Could not update the profile photo.',
  'No se pudo guardar la preferencia de tema.': 'Could not save the theme preference.',
  'No se pudo guardar la preferencia de idioma.': 'Could not save the language preference.',
  'Completa el título y la descripción del anuncio.': 'Enter a title and description for the post.',
  'La cantidad de jugadores debe ser un número entero positivo.': 'The number of players must be a positive whole number.',
  'El nombre del juego es obligatorio.': 'The game name is required.',
  'Portada subida. Guarda la ficha para aplicarla al juego.': 'Cover uploaded. Save the game entry to apply it.',
  'El chat solo se habilita a los participantes tras aceptar la invitación.': 'Private chat is only available to participants after they accept the invitation.',
  'El servidor no devolvió el resultado del envío.': 'The server did not return the send result.',
  'No se pudo cerrar la sesión.': 'Could not sign out.',
  'No se pudieron buscar ubicaciones.': 'Could not search for locations.',
  'No se pudo cargar toda tu actividad:': 'Could not load all your activity:',
  'Buscar ciudad o zona': 'Search for a city or area',
  'Publicaciones cerca de ti': 'Listings near you',
  'Anuncios en tu zona:': 'Listings in your area:',
  'MESA ABIERTA': 'OPEN TABLE',
  'Agregar ubicación': 'Add location',
  'Todavía no hay anuncios cercanos': 'No nearby listings yet',
  'Indica tu ubicación para ver anuncios cercanos': 'Add your location to see nearby listings',
  'Explora el tablón para descubrir otras mesas abiertas.': 'Explore the board to discover other open tables.',
  'Puedes agregar tu ciudad desde tu perfil.': 'You can add your city from your profile.',
  'Completa tu colección': 'Complete your collection',
  'Agrega juegos y encuentra nuevas mesas.': 'Add games and find new tables.',
  'Imagen del anuncio': 'Listing image',
  'JPG, PNG o WebP · hasta 8 MB': 'JPG, PNG, or WebP · up to 8 MB',
  'Cambiar imagen': 'Change image',
  'Agregar imagen': 'Add image',
  'Busca una ciudad o escribe «en línea»': 'Search for a city or type “online”',
  'La imagen debe pesar menos de 8 MB.': 'The image must be smaller than 8 MB.',
  'No se pudo leer la imagen seleccionada.': 'Could not read the selected image.',
  'No se pudo seleccionar la imagen.': 'Could not select the image.',
  'No se pudo borrar la imagen anterior:': 'Could not delete the previous image:',
  'Subiendo imagen...': 'Uploading image...',
  'Escribe al menos 3 caracteres para ver sugerencias.': 'Type at least 3 characters to see suggestions.',
  'Buscando ubicaciones...': 'Searching locations...',
  'No se encontraron ubicaciones. Prueba con otro nombre.': 'No locations found. Try another name.',
  'Ajusta la búsqueda o el filtro de estado para ver otros juegos.': 'Adjust your search or status filter to see other games.',
  'Busca juegos en MeepleMatch y agrégalos a tu colección.': 'Find games on MeepleMatch and add them to your collection.',
  'Catálogo de MeepleMatch y colección personal.': 'MeepleMatch catalog and personal collection.',
  'Catálogo de juegos': 'Game catalog',
  'Cuenta qué quieres crear y qué personas necesitas para lograrlo.': 'Describe what you want to create and who you need to make it happen.',
  'Detalles del juego': 'Game details',
  'Editar ficha del catálogo': 'Edit catalog entry',
  'El tablero está listo': 'The board is ready',
  'Encuentra tu equipo y construyan algo juntos.': 'Find your team and build something together.',
  'Encuentra tu próxima mesa': 'Find your next game group',
  'Estado en tu colección': 'Status in your collection',
  'Experiencia de quien publica': 'Host experience',
  'Juego (opcional)': 'Game (optional)',
  'Limpiar': 'Clear',
  'No encontramos juegos': 'No games found',
  'No encontramos juegos con ese nombre en el catálogo.': 'No games with that name were found in the catalog.',
  'No hay coincidencias': 'No matches',
  'No se encontraron jugadores nuevos con ese nombre.': 'No new players found with that name.',
  'No pudimos cargar el tablón': 'Could not load the board',
  'Objetivo del equipo': 'Team goal',
  'Portada del juego': 'Game cover',
  'Quitar': 'Remove',
  'Editar': 'Edit',
  'Quitar portada seleccionada': 'Remove selected cover',
  'Rechazar': 'Decline',
  'Reenviar correo de confirmación': 'Resend confirmation email',
  'Roles que busca': 'Roles wanted',
  'Selecciona una imagen JPG, PNG o WebP de hasta 8 MB.': 'Choose a JPG, PNG, or WebP image up to 8 MB.',
  'TU COLECCIÓN': 'YOUR COLLECTION',
  'Tu colección está vacía': 'Your collection is empty',
  'Volver a iniciar sesión': 'Back to sign in',
  'Año': 'Year',
  'Busca en el catálogo sincronizado': 'Search the synced catalog',
  'Buscar en el catálogo de juegos': 'Search the game catalog',
  'Buscar juego': 'Search game',
  'Buscar juegos de mi biblioteca': 'Search my library',
  'Ciudad o en línea': 'City or online',
  'Cualquier cantidad': 'Any number',
  'Describe el grupo y cómo serán las partidas.': 'Describe the group and what the games will be like.',
  'Descripción breve': 'Short description',
  'Duración (min)': 'Duration (min)',
  'Editorial': 'Publisher',
  'Escribe al menos 2 letras': 'Type at least 2 letters',
  'Jugadores buscados': 'Players wanted',
  'Jugadores buscados (mínimo)': 'Players wanted (minimum)',
  'Limpiar filtros': 'Clear filters',
  'Máx. jugadores': 'Max players',
  'Mín. jugadores': 'Min players',
  'Nombre de la editorial': 'Publisher name',
  'Nombre del juego': 'Game name',
  'O pega una ruta existente (opcional)': 'Or paste an existing path (optional)',
  'Objetivo a largo plazo': 'Long-term goal',
  'Rol que buscas': 'Role you are looking for',
  'Título': 'Title',
  'Zona o modalidad': 'Area or format',
  'Ej. 3': 'e.g. 3',
  'Ej. Campaña de rol de larga duración': 'e.g. Long-running role-playing campaign',
  'Ej. Catan': 'e.g. Catan',
  'Ej. narrador': 'e.g. Game master',
  'Ej. narrador, estratega, organizador': 'e.g. Game master, strategist, organizer',
  '¿Qué les gustaría conseguir como equipo?': 'What would you like to accomplish as a team?',
  '1': '1',
  '2025': '2025',
  '4': '4',
  '60': '60',
  'Abrir en Google Maps': 'Open in Google Maps',
  'Sugerencias de OpenStreetMap · © OpenStreetMap contributors': 'Suggestions by OpenStreetMap · © OpenStreetMap contributors',
  'Idioma': 'Language',
  'Español': 'Spanish',
  'English': 'English',
  'Cerrar sesión': 'Sign out',
  'Cargando perfil...': 'Loading profile...',
  'No se pudo cargar tu perfil.': 'Could not load your profile.',
  'Reintentar': 'Try again',
  'TU PRÓXIMA GRAN PARTIDA EMPIEZA AQUÍ.': 'YOUR NEXT GREAT GAME STARTS HERE.',
  '¡Hola': 'Hello',
  'Tu próxima gran partida empieza con una buena compañía.': 'Your next great game starts with good company.',
  'Preparando tu mesa...': 'Getting your table ready...',
  'Mis juegos': 'My games',
  'Invitaciones': 'Invitations',
  '¿Buscas tu próximo equipo?': 'Looking for your next team?',
  'Descubre proyectos abiertos o publica la idea que quieres convertir en una gran campaña.': 'Discover open projects or post an idea for your next great campaign.',
  'Explorar el tablón': 'Explore the board',
  'Proyectos destacados': 'Featured projects',
  'Nuevas mesas que buscan jugadores': 'New groups looking for players',
  'Ver todos': 'View all',
  'PROYECTO ABIERTO': 'OPEN PROJECT',
  'Todavía no hay proyectos abiertos': 'There are no open projects yet',
  'Puedes publicar el primero desde el tablón.': 'You can post the first one on the board.',
  'Completa tu perfil': 'Complete your profile',
  'Cuéntale a la comunidad qué te gusta.': 'Tell the community what you enjoy.',
  'Vincula tu colección BGG': 'Link your BGG collection',
  'Importa tus juegos y encuentra nuevas mesas.': 'Import your games and find new groups.',
  'Saliendo...': 'Signing out...',
  'Salir': 'Sign out',
  'CONEXIONES DE CONFIANZA': 'TRUSTED CONNECTIONS',
  'Mensajes': 'Messages',
  'El chat privado se habilita cuando ambas personas aceptan.': 'Private chat is enabled once both people accept.',
  'Buscar jugadores': 'Find players',
  'Solicitudes': 'Requests',
  'Chat abierto': 'Open chat',
  'Invitación aceptada · chat privado': 'Invitation accepted · private chat',
  'Cargando invitaciones...': 'Loading requests...',
  'Cargando proyectos...': 'Loading projects...',
  'Cargando tu biblioteca...': 'Loading your library...',
  'Abriendo conversación...': 'Opening conversation...',
  'Saluda y empieza a planear la próxima partida.': 'Say hello and start planning your next game.',
  'Escribe un mensaje...': 'Write a message...',
  'Enviar': 'Send',
  'Buscar': 'Search',
  'Ver perfil': 'View profile',
  'Enviar solicitud de amistad': 'Send connection request',
  'Perfil de jugador': 'Player profile',
  'Cerrar': 'Close',
  'Cargando perfil y biblioteca...': 'Loading profile and game library...',
  'Ubicación no indicada': 'Location not provided',
  'Jugador casual': 'Casual player',
  'Gustos de juego': 'Game interests',
  'Aún no indicó preferencias.': 'No preferences added yet.',
  'Biblioteca lúdica': 'Game library',
  'Abrir chat': 'Open chat',
  'En tu colección': 'In your collection',
  'Busca jugadores': 'Find players',
  'Año de publicación': 'Publication year',
  'Nombre *': 'Name *',
  'Descripción': 'Description',
  'Ubicación': 'Location',
  'Tus juegos': 'Your games',
  'Hay un error': 'There is an error',
  'Foto de perfil': 'Profile photo',
  'tu@correo.com': 'you@email.com',
  'Ingresa el correo de la cuenta que quieres validar.': 'Enter the email address of the account you want to verify.',
  'Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.': 'Account created. Check your email and confirm your address before signing in.',
  'Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva.': 'If an account exists for this email, you will receive a link to create a new password.',
  'Si la cuenta aún necesita confirmación, Supabase enviará un nuevo correo.': 'If the account still needs confirmation, Supabase will send another email.',
  'No se pudo reenviar el correo de confirmación.': 'Could not resend the confirmation email.',
  'En su colección': 'In collection',
  'Ya lo jugó': 'Played',
  'Quiere jugarlo': 'Wants to play',
  'Todavía no agregó juegos a su biblioteca.': 'No games added to their library yet.',
  'No indicó juegos en esta categoría.': 'No games listed in this category.',
  'Solicitudes recibidas': 'Received requests',
  'Solicitudes enviadas': 'Sent requests',
  'Cuando alguien quiera conectar contigo, verás su solicitud aquí.': 'Connection requests will appear here.',
  'Las invitaciones que envíes aparecerán aquí.': 'Invitations you send will appear here.',
  'Cargando catálogo...': 'Loading catalog...',
  'Buscar un juego por nombre': 'Search games by name',
  'Agregar juego al catálogo': 'Add a game to the catalog',
  'Cancelar alta': 'Cancel',
  'Guardar cambios': 'Save changes',
  'Guardar en catálogo': 'Save to catalog',
  'Agregar a mi colección': 'Add to my collection',
  'No se pudo cargar el tablón de proyectos.': 'Could not load the project board.',
  'No se pudo publicar el anuncio.': 'Could not publish the post.',
  'Buscar por título, objetivo, descripción o jugador': 'Search by title, goal, description, or player',
  'Buscar proyecto': 'Search projects',
  'Publicar proyecto': 'Post a project',
  'Crear proyecto': 'Create project',
  'Conoce jugadores, arma tu grupo y comparte tu próxima aventura.': 'Meet players, build your group, and share your next adventure.',
  'Iniciar sesión': 'Sign in',
  'Crear cuenta': 'Create account',
  'Recuperar contraseña': 'Reset password',
  'Tu próxima partida empieza aquí.': 'Your next game starts here.',
  '¿Cómo te llamamos?': 'What should we call you?',
  'Correo electrónico': 'Email address',
  'Contraseña': 'Password',
  'Mínimo 8 caracteres': 'At least 8 characters',
  '¿Olvidaste tu contraseña?': 'Forgot your password?',
  'Continuar': 'Continue',
  'La contraseña debe tener al menos 8 caracteres.': 'Password must be at least 8 characters.',
  'Ingresa un correo electrónico válido.': 'Enter a valid email address.',
  'Ingresa el nombre que se mostrará en tu perfil.': 'Enter the name to show on your profile.',
  'Sesión iniciada correctamente.': 'Signed in successfully.',
  'Crear contraseña nueva': 'Create a new password',
  'Tu contraseña se actualizó correctamente.': 'Your password was updated successfully.',
  'Elige una contraseña segura de al menos 8 caracteres.': 'Choose a secure password with at least 8 characters.',
  'Contraseña nueva': 'New password',
  'Repite la contraseña': 'Repeat password',
  'Las contraseñas no coinciden.': 'Passwords do not match.',
  'Guardar contraseña': 'Save password',
  'Continuar a MeepleMatch': 'Continue to MeepleMatch',
};

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>('es');
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedLanguage) => {
        if (active && (storedLanguage === 'es' || storedLanguage === 'en')) {
          setLanguageState(storedLanguage);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStorageError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar el idioma guardado.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    setStorageError('');
    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextLanguage);
      setLanguageState(nextLanguage);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el idioma.';
      setStorageError(message);
      throw error;
    }
  }, []);

  const translate = useCallback(
    (text: string) =>
      language === 'en' ? (ENGLISH_TRANSLATIONS[text] ?? text) : text,
    [language],
  );

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, translate, storageError }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider.');
  }
  return context;
}
