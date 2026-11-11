/**
 * RAÍZ de la jerarquía de pantallas.
 *
 *   _layout.tsx            ← providers globales + pantalla de carga
 *   ├─ (auth)/             ← NIVEL 0 · sin sesión: acceso y recuperación
 *   │   └─ sign-in.tsx
 *   └─ (app)/              ← NIVEL 1 · con sesión: 5 pestañas
 *       ├─ index.tsx       (Inicio)
 *       ├─ explore.tsx     (Tablón)
 *       ├─ library.tsx     (Juegos)
 *       ├─ messages.tsx    (Chat)
 *       └─ profile.tsx     (Perfil)
 *
 * Los grupos entre paréntesis NO cambian la URL: `/`, `/explore`, etc. siguen igual.
 * Qué grupo se muestra lo decide cada `_layout` según la sesión (ver `(auth)/_layout`
 * y `(app)/_layout`), así ninguna pantalla se mezcla con otra.
 */
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ThemedView } from '@/components/themed-view';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { AccessibilityProvider, useAccessibility } from '@/providers/accessibility-provider';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { LanguageProvider } from '@/providers/language-provider';
import { ThemePreferenceProvider } from '@/providers/theme-preference-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
  const { loading } = useAuth();

  return (
    <View style={styles.container}>
      {loading ? (
        <ThemedView style={styles.loading}>
          <ActivityIndicator size="large" accessibilityLabel="Cargando" />
        </ThemedView>
      ) : (
        // Hasta saber si hay sesión no se monta ningún grupo; así no hay
        // redirecciones erróneas ni parpadeos entre acceso y app.
        <Slot />
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
