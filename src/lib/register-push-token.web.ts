export async function registerPushToken(_userId: string): Promise<never> {
  throw new Error(
    'Las notificaciones push para mensajes están disponibles en Android e iOS, no en la versión web.',
  );
}
