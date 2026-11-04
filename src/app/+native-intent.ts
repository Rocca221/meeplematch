/**
 * Los enlaces de confirmación de correo y de recuperación de contraseña abren la
 * app con `meeplematch://auth/callback?...`. `AuthProvider` los procesa por su
 * cuenta (Linking), así que el enrutador solo debe llevar al usuario al inicio
 * en lugar de mostrar una ruta inexistente.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes('auth/callback')) return '/';
  return path;
}
