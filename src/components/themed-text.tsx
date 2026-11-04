import {
  Platform,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { scaleFont, scaleLineHeight, type Writable } from '@/constants/accessibility-prefs';
import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';
import { useLanguage } from '@/providers/language-provider';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({
  children,
  style,
  type = 'default',
  themeColor,
  numberOfLines,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const { translate } = useLanguage();
  const { effective } = useAccessibility();

  const translatedChildren =
    typeof children === 'string' ? translate(children) : children;

  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'accent' : 'text')];
  const merged = StyleSheet.flatten([styles[type], style]) as TextStyle;

  // El tamaño de texto elegido en Accesibilidad se aplica aquí, así llega a
  // todas las pantallas sin tocar cada estilo.
  const scale = effective.textScale;
  const scaled: Writable<TextStyle> = {};
  if (scale !== 1 && typeof merged.fontSize === 'number') {
    scaled.fontSize = scaleFont(merged.fontSize, scale);
    if (typeof merged.lineHeight === 'number') {
      scaled.lineHeight = scaleLineHeight(merged.lineHeight, merged.fontSize, scale);
    }
  } else if (scale !== 1 && typeof merged.lineHeight === 'number') {
    scaled.lineHeight = Math.round(merged.lineHeight * scale);
  }

  return (
    <Text
      allowFontScaling={false}
      // Con texto grande no se recortan los textos con puntos suspensivos.
      numberOfLines={scale >= 1.25 ? undefined : numberOfLines}
      accessibilityRole={
        rest.accessibilityRole ?? (type === 'title' || type === 'subtitle' ? 'header' : undefined)
      }
      style={[{ color }, merged, scaled]}
      {...rest}>
      {translatedChildren}
    </Text>
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
