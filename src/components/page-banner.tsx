import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CloudImage } from '@/components/cloud-image';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PageBannerProps = {
  image: string;
  kicker?: string;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
};

/**
 * Franja con foto de fondo y capa oscura. Sin título es solo decorativa;
 * con título muestra el encabezado de la pantalla sobre la foto.
 */
export function PageBanner({ image, kicker, title, subtitle, children }: PageBannerProps) {
  const theme = useTheme();
  const hasCopy = Boolean(title);

  return (
    <View
      accessibilityRole="image"
      style={[
        styles.banner,
        hasCopy ? styles.bannerTall : styles.bannerSlim,
        { borderColor: theme.border },
      ]}>
      <CloudImage uri={image} style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} />
      <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />
      {hasCopy ? (
        <View style={styles.copy}>
          {kicker ? (
            <ThemedText type="smallBold" style={styles.kicker}>
              {kicker}
            </ThemedText>
          ) : null}
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  bannerSlim: {
    height: 110,
  },
  bannerTall: {
    minHeight: 170,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11,13,16,0.62)',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  copy: {
    padding: Spacing.four,
    paddingLeft: Spacing.four + Spacing.one,
    gap: Spacing.one,
  },
  kicker: {
    color: '#C5CCD6',
    letterSpacing: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    color: '#F2F5F9',
    fontFamily: Fonts.serif,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: 700,
  },
  subtitle: {
    color: '#C5CCD6',
  },
});
