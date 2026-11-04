import { useWindowDimensions } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * Reparte el ancho disponible en columnas para que el contenido llene la
 * pantalla en web/tablet y se mantenga en una sola columna en el celular.
 */
export function useGridColumns({
  minColumnWidth = 320,
  maxColumns = 3,
  gap = Spacing.three,
}: { minColumnWidth?: number; maxColumns?: number; gap?: number } = {}) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  const columns = Math.max(
    1,
    Math.min(
      maxColumns,
      Math.floor((contentWidth + gap) / (minColumnWidth + gap)),
    ),
  );
  const columnWidth =
    columns > 1
      ? Math.floor((contentWidth - gap * (columns - 1)) / columns)
      : undefined;

  return { columns, columnWidth, gap, isWide: width >= 900 };
}
