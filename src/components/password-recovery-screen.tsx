import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pressable } from '@/components/accessible-pressable';
import { StatusMessage } from '@/components/status-message';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export function PasswordRecoveryScreen() {
  const theme = useTheme();
  const { finishPasswordRecovery } = useAuth();
  const border = theme.border;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  async function savePassword() {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setComplete(true);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'No se pudo actualizar la contraseña. Solicita un enlace nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        {/* 'padding' también en Android: con edge-to-edge el sistema ya no
            redimensiona la ventana y el teclado tapaba los campos. */}
        <KeyboardAvoidingView style={styles.keyboardArea} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <ThemedText type="title" style={styles.title}>
                Crear contraseña nueva
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {complete
                  ? 'Tu contraseña se actualizó correctamente.'
                  : 'Elige una contraseña segura de al menos 8 caracteres.'}
              </ThemedText>

              {!complete ? (
                <>
                  <PasswordField
                    label="Contraseña nueva"
                    value={password}
                    onChangeText={setPassword}
                    color={theme.text}
                    border={border}
                    disabled={busy}
                  />
                  <PasswordField
                    label="Repite la contraseña"
                    value={confirmation}
                    onChangeText={setConfirmation}
                    color={theme.text}
                    border={border}
                    disabled={busy}
                  />
                </>
              ) : null}

              {error ? (
                <StatusMessage kind="error">{error}</StatusMessage>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  complete ? finishPasswordRecovery() : void savePassword()
                }
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.accentFill },
                  (pressed || busy) && styles.pressed,
                ]}>
                <ThemedText style={styles.buttonText}>
                  {complete
                    ? 'Continuar a MeepleMatch'
                    : busy
                      ? 'Guardando...'
                      : 'Guardar contraseña'}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  color,
  border,
  disabled,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  color: string;
  border: string;
  disabled: boolean;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <LocalizedTextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!disabled}
        onChangeText={onChangeText}
        placeholder="Mínimo 8 caracteres"
        placeholderTextColor="#858995"
        secureTextEntry
        style={[styles.input, { color, borderColor: border }]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    gap: Spacing.three,
    padding: Spacing.four,
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#C73535',
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
    opacity: 0.72,
  },
});
