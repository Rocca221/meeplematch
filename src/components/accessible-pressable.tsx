import { useState } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  type PressableProps,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

import type { Writable } from '@/constants/accessibility-prefs';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';

export type AccessiblePressableProps = PressableProps & {
  /** Para elementos que no son controles (p. ej. una tarjeta grande). */
  disableMinTarget?: boolean;
};

/**
 * Reemplazo directo de `Pressable` de React Native. Aporta, para todos los
 * botones de la app:
 * - área mínima de pulsación (44 px, 56 px con "controles grandes");
 * - rol "button" por defecto;
 * - anillo de foco visible al navegar con teclado (en web lo dibuja global.css);
 * - borde con contraste suficiente en controles con contorno.
 */
export function Pressable({
  style,
  disableMinTarget,
  accessibilityRole,
  onFocus,
  onBlur,
  ...rest
}: AccessiblePressableProps) {
  const theme = useTheme();
  const { effective } = useAccessibility();
  const [focused, setFocused] = useState(false);
  const minTarget = effective.minTarget;

  return (
    <RNPressable
      accessibilityRole={accessibilityRole ?? (rest.onPress ? 'button' : undefined)}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => {
        const resolved = (StyleSheet.flatten(
          typeof style === 'function' ? style(state) : style,
        ) ?? {}) as ViewStyle;
        const extra: Writable<ViewStyle> = {};

        if (!disableMinTarget) {
          extra.minHeight = Math.max(
            typeof resolved.minHeight === 'number' ? resolved.minHeight : 0,
            minTarget,
          );
          if (typeof resolved.width === 'number' && resolved.width < minTarget) {
            extra.width = minTarget;
          }
          if (typeof resolved.height === 'number' && resolved.height < minTarget) {
            extra.height = minTarget;
          }
        }
        if (resolved.borderWidth && resolved.borderColor === theme.border) {
          extra.borderColor = theme.controlBorder;
        }
        if (focused && Platform.OS !== 'web') {
          extra.outlineColor = theme.focus;
          extra.outlineWidth = 3;
          extra.outlineOffset = 2;
          extra.outlineStyle = 'solid';
        }
        return [resolved, extra];
      }}
      {...rest}
    />
  );
}
