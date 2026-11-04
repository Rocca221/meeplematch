import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const { effective } = useAccessibility();

  // Con contraste alto las tarjetas se delimitan con un borde visible, para no
  // depender solo de la diferencia de tono entre superficie y fondo.
  let outline: ViewStyle | null = null;
  if (
    effective.contrast !== 'normal' &&
    (type === 'backgroundElement' || type === 'backgroundSelected')
  ) {
    const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
    if (!flat?.borderWidth) {
      outline = { borderWidth: 1, borderColor: theme.border };
    }
  }

  return (
    <View
      style={[{ backgroundColor: theme[type ?? 'background'] }, outline, style]}
      {...otherProps}
    />
  );
}
