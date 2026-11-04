import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setNavInset } from '@/hooks/use-top-inset';
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

export function CustomTabList({ children }: TabListProps) {
  const theme = useTheme();
  const router = useRouter();
  const { language } = useLanguage();

  return (
    <View
      style={styles.tabListContainer}
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

        <Pressable
          accessibilityLabel={
            language === 'en' ? 'Open accessibility settings' : 'Abrir ajustes de accesibilidad'
          }
          onPress={() => router.push({ pathname: '/profile', params: { section: 'accessibility' } })}
          style={[styles.a11yButton, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Aa
          </ThemedText>
          <ThemedText type="smallBold">Accesibilidad</ThemedText>
        </Pressable>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
    width: '100%',
    padding: Spacing.three,
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
    maxWidth: MaxContentWidth,
  },
  a11yButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
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
