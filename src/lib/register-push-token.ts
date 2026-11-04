import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken(userId: string) {
  if (!Device.isDevice) {
    throw new Error('Las notificaciones push requieren un dispositivo físico.');
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error(
      'Falta el identificador EAS del proyecto. Ejecuta "npx eas-cli@latest init" y vuelve a intentar.',
    );
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Mensajes',
      importance: AndroidImportance.DEFAULT,
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    throw new Error('Permiso de notificaciones no concedido.');
  }

  let token: string;
  try {
    ({ data: token } = await Notifications.getExpoPushTokenAsync({ projectId }));
  } catch (tokenError) {
    const detail = tokenError instanceof Error ? tokenError.message : '';
    if (/FirebaseApp|FCM|google-services/i.test(detail)) {
      throw new Error(
        'Esta instalación no tiene configurado Firebase (FCM), necesario para las notificaciones push en Android. Consulta la guía de compilación del README.',
      );
    }
    throw tokenError;
  }
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
    },
    { onConflict: 'token' },
  );

  if (error) throw error;
  return token;
}
