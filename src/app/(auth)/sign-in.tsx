import { AuthScreen } from '@/components/auth-screen';
import { PasswordRecoveryScreen } from '@/components/password-recovery-screen';
import { useAuth } from '@/providers/auth-provider';

/**
 * Única pantalla del grupo (auth): según el estado muestra el acceso /
 * registro / "olvidé mi contraseña", o el formulario de contraseña nueva
 * cuando el usuario llega desde el enlace de recuperación.
 */
export default function SignInRoute() {
  const { session, passwordRecovery } = useAuth();

  return session && passwordRecovery ? <PasswordRecoveryScreen /> : <AuthScreen />;
}
