import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthScreen } from '@/components/auth-screen';
import { PasswordRecoveryScreen } from '@/components/password-recovery-screen';
import AppTabs from '@/components/app-tabs';
import { ThemedView } from '@/components/themed-view';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { AccessibilityProvider, useAccessibility } from '@/providers/accessibility-provider';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { LanguageProvider } from '@/providers/language-provider';
import { ThemePreferenceProvider } from '@/providers/theme-preference-provider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  return (
    <AuthProvider>
      <ThemePreferenceProvider>
        <AccessibilityProvider>
          <LanguageProvider>
            <ThemedApp />
          </LanguageProvider>
        </AccessibilityProvider>
      </ThemePreferenceProvider>
    </AuthProvider>
  );
}

function ThemedApp() {
  const colorScheme = useEffectiveColorScheme();
  const palette = useTheme();
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.backgroundElement,
      text: palette.text,
      border: palette.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <MotionPreference />
      <AppContent />
    </ThemeProvider>
  );
}

/** Hace que las animaciones de Reanimated respeten "Reducir animaciones". */
function MotionPreference() {
  const { effective } = useAccessibility();
  return (
    <ReducedMotionConfig
      mode={effective.reduceMotion ? ReduceMotion.Always : ReduceMotion.Never}
    />
  );
}

function AppContent() {
  const { session, loading, passwordRecovery } = useAuth();

  return (
    <View style={styles.container}>
      {loading ? (
        <ThemedView style={styles.loading}>
          <ActivityIndicator size="large" accessibilityLabel="Cargando" />
        </ThemedView>
      ) : session && passwordRecovery ? (
        <PasswordRecoveryScreen />
      ) : session ? (
        <AppTabs />
      ) : (
        <AuthScreen />
      )}
      <AnimatedSplashOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
