import { StyleSheet, TextInput, type TextInputProps, type TextStyle } from 'react-native';

import { scaleFont, scaleLineHeight, type Writable } from '@/constants/accessibility-prefs';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';
import { useLanguage } from '@/providers/language-provider';

/**
 * Campo de texto traducible y accesible: escala con el tamaño de texto,
 * usa un borde con contraste suficiente, un marcador legible y siempre
 * tiene nombre accesible (la etiqueta o, si falta, el marcador).
 */
export function LocalizedTextInput({
  accessibilityLabel,
  placeholder,
  style,
  ...props
}: TextInputProps) {
  const { translate } = useLanguage();
  const theme = useTheme();
  const { effective } = useAccessibility();

  const merged = StyleSheet.flatten(style) as TextStyle | undefined;
  const scale = effective.textScale;
  const override: Writable<TextStyle> = {};
  if (merged?.borderWidth && merged.borderColor === theme.border) {
    override.borderColor = theme.controlBorder;
  }
  const fontSize = merged?.fontSize ?? 16;
  if (scale !== 1) {
    override.fontSize = scaleFont(fontSize, scale);
    if (typeof merged?.lineHeight === 'number') {
      override.lineHeight = scaleLineHeight(merged.lineHeight, fontSize, scale);
    }
  }
  const growth = 1 + (scale - 1) * 0.8;
  const baseMinHeight = typeof merged?.minHeight === 'number' ? merged.minHeight : 0;
  const minHeight = Math.max(baseMinHeight, effective.minTarget);
  override.minHeight = Math.round(minHeight * growth);

  const translatedPlaceholder = placeholder ? translate(placeholder) : placeholder;
  const label = accessibilityLabel ? translate(accessibilityLabel) : translatedPlaceholder;

  return (
    <TextInput
      {...props}
      allowFontScaling={false}
      accessibilityLabel={label}
      placeholder={translatedPlaceholder}
      placeholderTextColor={theme.textSecondary}
      style={[style, override]}
    />
  );
}
