import { useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pressable } from '@/components/accessible-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAppPanels } from '@/providers/app-panels-provider';

/**
 * Si un administrador suspendió la cuenta, en lugar de la app se muestra este
 * aviso. (La base de datos además bloquea publicar, mostrar interés e invitar.)
 */
export function SuspensionGate({ children }: PropsWithChildren) {
  const { suspended } = useAppPanels();
  const theme = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  if (!suspended) return <>{children}</>;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.card}>
          <ThemedText type="title" style={styles.title}>
            Tu cuenta está suspendida
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Un administrador suspendió tu cuenta por incumplir las normas de la comunidad. Mientras
            tanto no puedes publicar, mostrar interés ni invitar a otros jugadores. Si crees que
            es un error, contacta al equipo de MeepleMatch.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={signingOut}
            onPress={() => {
              setSigningOut(true);
              void supabase.auth.signOut().finally(() => setSigningOut(false));
            }}
            style={[styles.button, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{signingOut ? 'Saliendo...' : 'Salir'}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: { fontSize: 30, lineHeight: 38 },
  button: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
});
