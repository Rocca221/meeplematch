import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setNavInset } from '@/hooks/use-top-inset';
import { supabase } from '@/lib/supabase';
import { useAppPanels } from '@/providers/app-panels-provider';
import { useLanguage } from '@/providers/language-provider';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  const { language } = useLanguage();
  return (
    <Tabs>
      <a
        className="mm-skip-link"
        href="#mm-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('mm-main')?.focus();
        }}>
        {language === 'en' ? 'Skip to main content' : 'Saltar al contenido principal'}
      </a>
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Inicio</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Tablón</TabButton>
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <TabButton>Juegos</TabButton>
          </TabTrigger>
          <TabTrigger name="messages" href="/messages" asChild>
            <TabButton>Chat</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>Perfil</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
      <div id="mm-main" tabIndex={-1} style={{ outline: 'none', height: 0 }} />
      <TabSlot style={{ height: '100%' }} />
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  disabled,
  testID,
}: TabTriggerSlotProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tabButton,
        { borderBottomColor: isFocused ? theme.accent : 'transparent' },
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type="smallBold"
        themeColor={isFocused ? 'text' : 'textSecondary'}
        style={styles.tabLabel}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

/** Acción de la barra (no es una pestaña): mismo aspecto que un TabButton sin seleccionar. */
function BarAction({
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        { borderBottomColor: 'transparent' },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.tabLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function CustomTabList({ children }: TabListProps) {
  const theme = useTheme();
  const router = useRouter();
  const { language } = useLanguage();
  const [signingOut, setSigningOut] = useState(false);
  const { unreadCount, openInbox, isAdmin, openAdmin } = useAppPanels();
  const en = language === 'en';

  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) window.alert(error.message);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : en
            ? 'Could not sign out.'
            : 'No se pudo cerrar la sesión.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View
      style={[
        styles.tabListContainer,
        { backgroundColor: theme.background, borderBottomColor: theme.border },
      ]}
      onLayout={(event) => setNavInset(event.nativeEvent.layout.height)}>
      <ThemedView
        type="backgroundElement"
        style={[styles.innerContainer, { borderColor: theme.border }]}>
        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: theme.accent }]} />
          <ThemedText type="smallBold" style={styles.brandText}>
            MeepleMatch
          </ThemedText>
        </View>

        {children}

        <BarAction
          label={
            (en ? 'Notifications' : 'Avisos') + (unreadCount ? ` (${unreadCount})` : '')
          }
          accessibilityLabel={
            en
              ? `Notifications, ${unreadCount} unread`
              : `Avisos, ${unreadCount} sin leer`
          }
          onPress={openInbox}
        />
        {isAdmin ? (
          <BarAction
            label="Admin"
            accessibilityLabel={en ? 'Open admin panel' : 'Abrir panel de administración'}
            onPress={openAdmin}
          />
        ) : null}
        <BarAction
          label={en ? 'Accessibility' : 'Accesibilidad'}
          accessibilityLabel={en ? 'Open accessibility settings' : 'Abrir ajustes de accesibilidad'}
          onPress={() => router.push({ pathname: '/profile', params: { section: 'accessibility' } })}
        />
        <BarAction
          label={signingOut ? (en ? 'Signing out...' : 'Saliendo...') : en ? 'Sign out' : 'Salir'}
          accessibilityLabel={en ? 'Sign out' : 'Cerrar sesión'}
          disabled={signingOut}
          onPress={() => void signOut()}
        />
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Siempre por encima del contenido, que además queda detrás con fondo opaco.
    zIndex: 100,
    width: '100%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.four,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
  },
  brand: {
    marginRight: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  brandMark: {
    width: 10,
    height: 10,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  brandText: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: 2,
  },
  tabLabel: {
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
