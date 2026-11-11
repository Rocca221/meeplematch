import { useState } from 'react';
import * as Linking from 'expo-linking';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccessibilityCenter } from '@/components/accessibility-center';
import { Pressable } from '@/components/accessible-pressable';
import { SelectedMark } from '@/components/choice';
import { StatusMessage } from '@/components/status-message';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';
import { useLanguage, type AppLanguage } from '@/providers/language-provider';

type AuthMode = 'signIn' | 'signUp' | 'forgotPassword';

export function AuthScreen() {
  const theme = useTheme();
  const { language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [languageError, setLanguageError] = useState('');
  const [showAccessibility, setShowAccessibility] = useState(false);

  const inputColor = theme.text;
  const secondaryColor = theme.textSecondary;
  const accentColor = theme.accent;
  const borderColor = theme.border;

  async function changeLanguage(nextLanguage: AppLanguage) {
    setLanguageError('');
    try {
      await setLanguage(nextLanguage);
    } catch (error) {
      setLanguageError(
        error instanceof Error ? error.message : 'No se pudo guardar el idioma.',
      );
    }
  }

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setFeedback('');
    setIsError(false);
    const { error } = await signInWithGoogle();
    if (error) {
      setFeedback(error);
      setIsError(true);
    }
    setGoogleBusy(false);
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFeedback('');
    setIsError(false);
    setAwaitingConfirmation(false);
  }

  function getAuthRedirectTo(type?: 'recovery') {
    if (Platform.OS !== 'web') {
      return Linking.createURL('auth/callback', {
        queryParams: type ? { type } : undefined,
      });
    }
    if (!type) return window.location.origin;

    const redirect = new URL(window.location.origin);
    redirect.searchParams.set('type', type);
    return redirect.toString();
  }

  async function submit() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = displayName.trim();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setFeedback('Ingresa un correo electrónico válido.');
      setIsError(true);
      return;
    }

    if (mode !== 'forgotPassword' && password.length < 8) {
      setFeedback('La contraseña debe tener al menos 8 caracteres.');
      setIsError(true);
      return;
    }

    if (mode === 'signUp' && !normalizedName) {
      setFeedback('Ingresa el nombre que se mostrará en tu perfil.');
      setIsError(true);
      return;
    }

    setBusy(true);
    setFeedback('');
    setIsError(false);
    setAwaitingConfirmation(false);

    try {
      if (mode === 'forgotPassword') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          { redirectTo: getAuthRedirectTo('recovery') },
        );
        if (error) throw error;
        setFeedback(
          'Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva.',
        );
        return;
      }

      const result =
        mode === 'signIn'
          ? await supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password,
            })
          : await supabase.auth.signUp({
              email: normalizedEmail,
              password,
              options: {
                data: { display_name: normalizedName },
                emailRedirectTo: getAuthRedirectTo(),
              },
            });

      if (result.error) {
        setFeedback(result.error.message);
        setIsError(true);
        return;
      }

      if (mode === 'signUp' && !result.data.session) {
        setAwaitingConfirmation(true);
        setFeedback(
          'Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.',
        );
        return;
      }

      setFeedback('Sesión iniciada correctamente.');
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'No se pudo conectar con Supabase. Revisa tu conexión e inténtalo de nuevo.',
      );
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setFeedback('Ingresa el correo de la cuenta que quieres validar.');
      setIsError(true);
      return;
    }

    setBusy(true);
    setFeedback('');
    setIsError(false);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: getAuthRedirectTo() },
      });
      if (error) throw error;
      setFeedback(
        'Si la cuenta aún necesita confirmación, Supabase enviará un nuevo correo.',
      );
      setAwaitingConfirmation(false);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'No se pudo reenviar el correo de confirmación.',
      );
      setIsError(true);
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
              <View style={styles.languagePicker}>
                {(
                  [
                    ['es', 'Español'],
                    ['en', 'English'],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: language === value }}
                    onPress={() => void changeLanguage(value)}
                    style={[
                      styles.languageOption,
                      { borderColor: language === value ? accentColor : borderColor },
                    ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SelectedMark selected={language === value} />
                      <ThemedText
                        type="smallBold"
                        style={
                          language === value ? { color: accentColor } : undefined
                        }>
                        {label}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showAccessibility }}
                onPress={() => setShowAccessibility((value) => !value)}
                style={[styles.a11yToggle, { borderColor }]}>
                <ThemedText type="smallBold" style={{ color: accentColor }}>
                  Aa
                </ThemedText>
                <ThemedText type="smallBold">Accesibilidad</ThemedText>
                <ThemedText type="smallBold">{showAccessibility ? '▲' : '▼'}</ThemedText>
              </Pressable>
              {showAccessibility ? (
                <ThemedView type="backgroundElement" style={[styles.a11yPanel, { borderColor }]}>
                  <AccessibilityCenter compact />
                </ThemedView>
              ) : null}
              {languageError ? (
                <StatusMessage kind="error">{languageError}</StatusMessage>
              ) : null}
              <View style={styles.brand}>
                <View style={[styles.brandMark, { backgroundColor: theme.accentFill }]}>
                  <ThemedText style={styles.brandMarkText}>M</ThemedText>
                </View>
                <ThemedText type="title" style={styles.title}>
                  MeepleMatch
                </ThemedText>
                <ThemedText style={[styles.subtitle, { color: secondaryColor }]}>
                  Tu próxima partida empieza aquí.
                </ThemedText>
              </View>

              {mode === 'forgotPassword' ? (
                <ThemedText type="subtitle">Recuperar contraseña</ThemedText>
              ) : (
                <View style={[styles.modeSwitch, { borderColor }]}>
                  <ModeButton
                    active={mode === 'signIn'}
                    label="Iniciar sesión"
                    onPress={() => changeMode('signIn')}
                  />
                  <ModeButton
                    active={mode === 'signUp'}
                    label="Crear cuenta"
                    onPress={() => changeMode('signUp')}
                  />
                </View>
              )}

              <ThemedText type="small" themeColor="textSecondary">
                Todos los campos son obligatorios.
              </ThemedText>

              {mode === 'signUp' && (
                <FormField
                  label="Nombre de jugador"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="¿Cómo te llamamos?"
                  textColor={inputColor}
                  placeholderColor={secondaryColor}
                  borderColor={borderColor}
                  editable={!busy}
                  autoCapitalize="words"
                />
              )}

              <FormField
                label="Correo electrónico"
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                textColor={inputColor}
                placeholderColor={secondaryColor}
                borderColor={borderColor}
                editable={!busy}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {mode !== 'forgotPassword' ? (
                <FormField
                  label="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 8 caracteres"
                  textColor={inputColor}
                  placeholderColor={secondaryColor}
                  borderColor={borderColor}
                  editable={!busy}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={
                    mode === 'signUp' ? 'new-password' : 'current-password'
                  }
                />
              ) : null}

              {feedback ? (
                <StatusMessage kind={isError ? 'error' : 'info'}>{feedback}</StatusMessage>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={submit}
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: theme.accentFill },
                  (pressed || busy) && styles.pressed,
                ]}>
                <ThemedText style={styles.submitText}>
                  {busy
                    ? 'Procesando...'
                    : mode === 'forgotPassword'
                      ? 'Enviar enlace'
                      : mode === 'signIn'
                        ? 'Entrar'
                        : 'Crear mi cuenta'}
                </ThemedText>
              </Pressable>

              {mode !== 'forgotPassword' ? (
                <>
                  <View style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no">
                    <View style={[styles.orLine, { backgroundColor: borderColor }]} />
                    <ThemedText type="small" style={{ color: secondaryColor }}>
                      o
                    </ThemedText>
                    <View style={[styles.orLine, { backgroundColor: borderColor }]} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Continuar con Google"
                    disabled={busy || googleBusy}
                    onPress={() => void continueWithGoogle()}
                    style={({ pressed }) => [
                      styles.googleButton,
                      { borderColor },
                      (pressed || googleBusy) && styles.pressed,
                    ]}>
                    <ThemedText type="smallBold">
                      {googleBusy ? 'Abriendo Google...' : 'Continuar con Google'}
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}

              {mode === 'signIn' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => changeMode('forgotPassword')}
                  style={styles.textButton}>
                  <ThemedText style={{ color: accentColor }}>
                    ¿Olvidaste tu contraseña?
                  </ThemedText>
                </Pressable>
              ) : null}

              {mode === 'forgotPassword' ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => changeMode('signIn')}
                  style={styles.textButton}>
                  <ThemedText style={{ color: accentColor }}>
                    Volver a iniciar sesión
                  </ThemedText>
                </Pressable>
              ) : null}

              {awaitingConfirmation ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void resendConfirmation()}
                  style={styles.textButton}>
                  <ThemedText style={{ color: accentColor }}>
                    Reenviar correo de confirmación
                  </ThemedText>
                </Pressable>
              ) : null}

              <ThemedText style={[styles.footnote, { color: secondaryColor }]}>
                {mode === 'signIn'
                  ? 'Inicia sesión para continuar con tu comunidad de juegos.'
                  : mode === 'signUp'
                    ? 'Al crear tu cuenta se guardará tu perfil en MeepleMatch.'
                    : 'Te enviaremos un enlace seguro para establecer una contraseña nueva.'}
              </ThemedText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

type ModeButtonProps = {
  active: boolean;
  label: string;
  onPress: () => void;
};

function ModeButton({ active, label, onPress }: ModeButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeButton, active && { backgroundColor: theme.accentFill }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {active ? (
          <ThemedText style={[styles.modeLabel, styles.activeModeLabel]}>✓</ThemedText>
        ) : null}
        <ThemedText style={[styles.modeLabel, active && styles.activeModeLabel]}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  textColor: string;
  placeholderColor: string;
  borderColor: string;
  editable: boolean;
  autoCapitalize: 'none' | 'words';
  autoComplete?:
    | 'current-password'
    | 'new-password'
    | 'email'
    | 'name';
  keyboardType?: 'email-address';
  secureTextEntry?: boolean;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  textColor,
  placeholderColor,
  borderColor,
  editable,
  autoCapitalize,
  autoComplete,
  keyboardType,
  secureTextEntry,
}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <LocalizedTextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete ?? (keyboardType ? 'email' : 'name')}
        editable={editable}
        keyboardType={keyboardType ?? 'default'}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        secureTextEntry={secureTextEntry}
        style={[
          styles.input,
          { borderColor, color: textColor, backgroundColor: 'transparent' },
        ]}
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
  },
  a11yToggle: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  a11yPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.three,
  },
  languagePicker: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  languageOption: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  modeSwitch: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: Spacing.one,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeModeLabel: {
    color: '#FFFFFF',
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
  feedback: {
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  googleButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  orLine: {
    flex: 1,
    height: 1,
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.72,
  },
  textButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
