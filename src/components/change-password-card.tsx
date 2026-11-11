import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const MIN_LENGTH = 8;

/**
 * Cambio de contraseña desde Configuración (Perfil).
 *
 * - Cuenta con correo y contraseña: pide la actual (se verifica volviendo a
 *   iniciar sesión) y después guarda la nueva.
 * - Cuenta creada solo con Google: no tiene contraseña previa, así que permite
 *   crear una para poder entrar también con correo.
 */
export function ChangePasswordCard() {
  const theme = useTheme();
  const { session } = useAuth();
  const email = session?.user.email ?? '';
  const hasPassword =
    session?.user.identities?.some((identity) => identity.provider === 'email') ?? true;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function save() {
    setError('');
    setDone('');

    if (hasPassword && !current) {
      setError('Escribe tu contraseña actual.');
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`La contraseña nueva debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (next !== confirmation) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (hasPassword && next === current) {
      setError('La contraseña nueva debe ser distinta de la actual.');
      return;
    }

    setBusy(true);
    try {
      if (hasPassword) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });
        if (verifyError) {
          setError('La contraseña actual no es correcta.');
          return;
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;

      setCurrent('');
      setNext('');
      setConfirmation('');
      setDone(
        hasPassword
          ? 'Tu contraseña se actualizó correctamente.'
          : 'Contraseña creada. Ya puedes entrar con tu correo o con Google.',
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border }];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle" style={styles.title}>
        {hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        {hasPassword
          ? 'Por seguridad te pedimos la contraseña actual antes de guardar la nueva.'
          : 'Tu cuenta entra con Google. Puedes crear una contraseña para usar también tu correo.'}
      </ThemedText>

      {hasPassword ? (
        <Field label="Contraseña actual">
          <LocalizedTextInput
            accessibilityLabel="Contraseña actual"
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!busy}
            onChangeText={setCurrent}
            secureTextEntry={!visible}
            style={inputStyle}
            value={current}
          />
        </Field>
      ) : null}

      <Field label="Contraseña nueva">
        <LocalizedTextInput
          accessibilityLabel="Contraseña nueva"
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!busy}
          onChangeText={setNext}
          placeholder={`Mínimo ${MIN_LENGTH} caracteres`}
          placeholderTextColor="#858995"
          secureTextEntry={!visible}
          style={inputStyle}
          value={next}
        />
      </Field>

      <Field label="Repite la contraseña nueva">
        <LocalizedTextInput
          accessibilityLabel="Repite la contraseña nueva"
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!busy}
          onChangeText={setConfirmation}
          secureTextEntry={!visible}
          style={inputStyle}
          value={confirmation}
        />
      </Field>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: visible }}
        onPress={() => setVisible((value) => !value)}
        style={styles.toggle}>
        <ThemedText type="smallBold">
          {visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </ThemedText>
      </Pressable>

      {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
      {done ? <StatusMessage kind="success">{done}</StatusMessage> : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void save()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.accentFill },
          (pressed || busy) && styles.pressed,
        ]}>
        <ThemedText style={styles.buttonText}>
          {busy ? 'Guardando...' : hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: 18,
    gap: Spacing.three,
  },
  title: {
    fontSize: 22,
    lineHeight: 29,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  toggle: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.75,
  },
});
