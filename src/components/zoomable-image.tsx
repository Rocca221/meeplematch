import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { Modal, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';
import { useLanguage } from '@/providers/language-provider';

type ZoomableImageProps = {
  uri: string;
  /** Texto alternativo de la imagen (obligatorio: describe qué se ve). */
  alt: string;
  style?: ImageProps['style'];
  containerStyle?: ViewStyle;
  contentFit?: ImageProps['contentFit'];
};

/**
 * Imagen que se puede ampliar. Es un botón (accesible con teclado y lector de
 * pantalla) que abre la imagen a pantalla completa; se cierra con el botón,
 * tocando fuera o con Escape.
 */
export function ZoomableImage({
  uri,
  alt,
  style,
  containerStyle,
  contentFit = 'cover',
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const { language } = useLanguage();
  const { effective } = useAccessibility();
  const zoomLabel = language === 'en' ? `Enlarge image: ${alt}` : `Ampliar imagen: ${alt}`;

  return (
    <>
      <Pressable
        accessibilityLabel={zoomLabel}
        accessibilityHint={
          language === 'en' ? 'Opens the image full screen' : 'Abre la imagen a pantalla completa'
        }
        disableMinTarget
        onPress={() => setOpen(true)}
        style={containerStyle}>
        <Image source={{ uri }} alt={alt} contentFit={contentFit} style={style} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={effective.reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}>
        <View
          style={styles.backdrop}
          {...(Platform.OS === 'web'
            ? ({
                onKeyDown: (event: { key: string }) => {
                  if (event.key === 'Escape') setOpen(false);
                },
              } as object)
            : null)}>
          <Pressable
            accessibilityLabel={language === 'en' ? 'Close enlarged image' : 'Cerrar imagen ampliada'}
            disableMinTarget
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <Image source={{ uri }} alt={alt} contentFit="contain" style={styles.full} />
          <View style={styles.caption}>
            <ThemedText type="small" style={styles.captionText}>
              {alt}
            </ThemedText>
          </View>
          <Pressable
            accessibilityLabel={language === 'en' ? 'Close' : 'Cerrar'}
            onPress={() => setOpen(false)}
            style={[styles.close, { backgroundColor: theme.accentFill }]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              {language === 'en' ? '✕ Close' : '✕ Cerrar'}
            </ThemedText>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  full: {
    width: '100%',
    height: '78%',
  },
  caption: {
    paddingTop: Spacing.two,
  },
  captionText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  close: {
    position: 'absolute',
    top: Spacing.four,
    right: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
});
