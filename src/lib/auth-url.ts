import { supabase } from '@/lib/supabase';

export type AuthUrlResult = {
  /** El enlace era de recuperación de contraseña: hay que pedir una nueva. */
  recovery: boolean;
  error?: string;
};

const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
  'sms',
  'phone_change',
] as const;
type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function isEmailOtpType(type: string | null): type is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(type as EmailOtpType);
}

async function completeSession(url: string): Promise<AuthUrlResult> {
  try {
    const parsedUrl = new URL(url);
    const params = new URLSearchParams(
      parsedUrl.hash.replace(/^#/, '') || parsedUrl.search.replace(/^\?/, ''),
    );

    const errorDescription = params.get('error_description') ?? params.get('error');
    if (errorDescription) {
      return { recovery: false, error: errorDescription.replace(/\+/g, ' ') };
    }

    const isRecovery = params.get('type') === 'recovery';

    const code = params.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return { recovery: isRecovery };
    }

    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (tokenHash && isEmailOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) throw error;
      return { recovery: type === 'recovery' };
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      return { recovery: isRecovery };
    }

    return { recovery: false };
  } catch (error) {
    return {
      recovery: false,
      error: error instanceof Error ? error.message : 'No se pudo completar el acceso.',
    };
  }
}

// El mismo enlace puede llegar dos veces (al navegador de acceso y al sistema de
// enlaces del celular). Se procesa una sola vez y las demás llamadas reciben el
// mismo resultado.
const recent = new Map<string, Promise<AuthUrlResult>>();

/**
 * Convierte un enlace de retorno de Supabase (confirmación de correo,
 * recuperación de contraseña o acceso con Google) en una sesión iniciada.
 */
export function sessionFromAuthUrl(url: string): Promise<AuthUrlResult> {
  const existing = recent.get(url);
  if (existing) return existing;

  const pending = completeSession(url);
  recent.set(url, pending);
  void pending.finally(() => setTimeout(() => recent.delete(url), 10_000));
  return pending;
}
