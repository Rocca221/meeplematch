import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    let handlingUrl = false;

    async function handleNativeAuthUrl(url: string) {
      if (Platform.OS === 'web' || handlingUrl) return;
      handlingUrl = true;

      try {
        const parsedUrl = new URL(url);
        const params = new URLSearchParams(
          parsedUrl.hash.replace(/^#/, '') || parsedUrl.search.replace(/^\?/, ''),
        );
        const errorDescription =
          params.get('error_description') ?? params.get('error');
        if (errorDescription) {
          console.error('Supabase auth callback failed:', errorDescription);
          return;
        }

        const code = params.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (params.get('type') === 'recovery') setPasswordRecovery(true);
          return;
        }

        const tokenHash = params.get('token_hash');
        const type = params.get('type');
        if (tokenHash && isEmailOtpType(type)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
          if (type === 'recovery') setPasswordRecovery(true);
          return;
        }

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (params.get('type') === 'recovery') setPasswordRecovery(true);
        }
      } catch (error) {
        console.error(
          'Could not complete the Supabase auth callback:',
          error instanceof Error ? error.message : error,
        );
      } finally {
        handlingUrl = false;
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setLoading(false);
    });

    const urlSubscription =
      Platform.OS === 'web'
        ? null
        : Linking.addEventListener('url', ({ url }) => {
            void handleNativeAuthUrl(url);
          });

    if (Platform.OS !== 'web') {
      void Linking.getInitialURL().then((url) => {
        if (url && active) void handleNativeAuthUrl(url);
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      urlSubscription?.remove();
    };
  }, []);

  function finishPasswordRecovery() {
    setPasswordRecovery(false);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        passwordRecovery,
        finishPasswordRecovery,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

function isEmailOtpType(
  type: string | null,
): type is
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email'
  | 'sms'
  | 'phone_change' {
  return [
    'signup',
    'invite',
    'magiclink',
    'recovery',
    'email_change',
    'email',
    'sms',
    'phone_change',
  ].includes(type ?? '');
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
