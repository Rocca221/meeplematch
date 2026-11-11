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

import { sessionFromAuthUrl } from '@/lib/auth-url';
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
    async function handleNativeAuthUrl(url: string) {
      if (Platform.OS === 'web') return;
      const result = await sessionFromAuthUrl(url);
      if (result.error) {
        console.error('Supabase auth callback failed:', result.error);
        return;
      }
      if (result.recovery) setPasswordRecovery(true);
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

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
