import { Redirect, Slot } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

/**
 * NIVEL 0 · Acceso. Solo se ve sin sesión (o durante la recuperación de
 * contraseña). Con sesión normal, se manda a la app.
 */
export default function AuthLayout() {
  const { session, passwordRecovery } = useAuth();

  if (session && !passwordRecovery) {
    return <Redirect href="/" />;
  }

  return <Slot />;
}
