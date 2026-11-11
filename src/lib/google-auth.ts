import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { sessionFromAuthUrl } from '@/lib/auth-url';
import { supabase } from '@/lib/supabase';

/**
 * Inicia sesión con Google a través de Supabase.
 *
 * - Web: la página se redirige a Google y vuelve a la app (Supabase lee la sesión).
 * - Celular: se abre el navegador del sistema; al terminar, Google devuelve a la
 *   app con `meeplematch://auth/callback` (APK) o `exp://...` (Expo Go).
 *
 * Devuelve `{ error }` solo si algo falló; si la persona cancela, no hay error.
 */
export async function signInWithGoogle(): Promise<{ error?: string }> {
  try {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      });
      return error ? { error: error.message } : {};
    }

    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error || !data?.url) {
      return { error: error?.message ?? 'No se pudo iniciar el acceso con Google.' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return {}; // canceló o cerró la ventana

    const outcome = await sessionFromAuthUrl(result.url);
    return outcome.error ? { error: outcome.error } : {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo iniciar el acceso con Google.',
    };
  }
}
