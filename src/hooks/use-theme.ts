/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from 'react';

import { buildPalette, type Palette } from '@/constants/palettes';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useAccessibility } from '@/providers/accessibility-provider';

/** Paleta vigente: tema claro/oscuro + contraste + modo de color elegidos. */
export function useTheme(): Palette {
  const scheme = useEffectiveColorScheme();
  const { effective } = useAccessibility();
  const name = scheme === 'dark' ? 'dark' : 'light';

  return useMemo(
    () =>
      buildPalette({
        scheme: name,
        contrast: effective.contrast,
        colorMode: effective.colorMode,
      }),
    [name, effective.contrast, effective.colorMode],
  );
}
