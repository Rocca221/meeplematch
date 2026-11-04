import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

export type StatusKind = 'error' | 'success' | 'warning' | 'info';

type StatusMessageProps = {
  kind: StatusKind;
  children: string;
  style?: ViewStyle;
  /** Si se pasa, muestra un botón para cerrar el mensaje (no se cierra solo). */
  onDismiss?: () => void;
};

const LABELS: Record<StatusKind, { es: string; en: string; icon: string }> = {
  error: { es: 'Error', en: 'Error', icon: '✕' },
  success: { es: 'Listo', en: 'Done', icon: '✓' },
  warning: { es: 'Atención', en: 'Warning', icon: '!' },
  info: { es: 'Aviso', en: 'Notice', icon: 'i' },
};

/**
 * Mensaje de estado que no depende del color: lleva icono distinto por tipo,
 * una etiqueta escrita ("Error", "Listo") y el texto. Se anuncia a los
 * lectores de pantalla y permanece visible hasta que el usuario lo cierra o
 * cambia la pantalla.
 */
export function StatusMessage({ kind, children, style, onDismiss }: StatusMessageProps) {
  const theme = useTheme();
  const { language } = useLanguage();
  const label = LABELS[kind][language];
  const tone =
    kind === 'error'
      ? theme.danger
      : kind === 'success'
        ? theme.success
        : kind === 'warning'
          ? theme.warning
          : theme.accent;

  useEffect(() => {
    if (Platform.OS !== 'web' && children) {
      AccessibilityInfo.announceForAccessibility(`${label}. ${children}`);
    }
  }, [children, label]);

  return (
    <View
      role={kind === 'error' ? 'alert' : 'status'}
      accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
      style={[
        styles.box,
        { borderColor: tone, backgroundColor: theme.backgroundElement },
        style,
      ]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.icon, { backgroundColor: tone }]}>
        <ThemedText type="smallBold" style={[styles.iconText, { color: theme.background }]}>
          {LABELS[kind].icon}
        </ThemedText>
      </View>
      <View style={styles.body}>
        <ThemedText type="smallBold" style={{ color: tone }}>
          {label}
        </ThemedText>
        <ThemedText type="small">{children}</ThemedText>
      </View>
      {onDismiss ? (
        <Pressable
          accessibilityLabel={language === 'en' ? 'Dismiss message' : 'Cerrar mensaje'}
          onPress={onDismiss}
          style={styles.dismiss}>
          <ThemedText type="smallBold">✕</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderRadius: 10,
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconText: {
    lineHeight: 18,
    fontSize: 13,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  dismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
});
