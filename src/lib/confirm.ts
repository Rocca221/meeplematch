import { Alert, Platform } from 'react-native';

/**
 * Pide confirmación antes de una acción delicada (borrar, suspender...).
 * Devuelve `true` solo si la persona confirma. En web usa `window.confirm`
 * porque `Alert.alert` no muestra botones en navegadores.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel = 'Aceptar',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
