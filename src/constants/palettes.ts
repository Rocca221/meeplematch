/**
 * Paletas de MeepleMatch y su adaptación por accesibilidad.
 *
 * Este archivo es puro (sin imports de React Native) para poder probarlo con
 * Node y calcular los contrastes. `theme.ts` reexporta `Colors`.
 *
 * Reglas de diseño:
 * - `accent` se usa como color de texto, enlace y borde sobre el fondo.
 * - `accentFill` se usa como relleno de botones; siempre lleva texto
 *   `onAccent` (blanco) encima. Se separan porque ningún azul cumple a la vez
 *   4.5:1 contra blanco y contra el fondo oscuro.
 * - `success`, `danger` y `warning` nunca se usan solos: siempre van con
 *   icono y texto (ver StatusMessage).
 */

export type SchemeName = 'light' | 'dark';
export type ContrastLevel = 'normal' | 'high' | 'veryHigh';
export type ColorMode =
  | 'none'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'grayscale';

export const Colors = {
  light: {
    text: '#0F141A',
    background: '#E9ECF0',
    backgroundElement: '#F7F8FA',
    backgroundSelected: '#D8DDE4',
    textSecondary: '#4F5966',
    border: '#BFC6D0',
    controlBorder: '#7C8696',
    accent: '#1F5CBF',
    accentFill: '#1F5CBF',
    accentSoft: 'rgba(31, 92, 191, 0.08)',
    onAccent: '#FFFFFF',
    silver: '#8A94A3',
    success: '#1B7A43',
    danger: '#B3261E',
    warning: '#8A5300',
    focus: '#1D4ED8',
  },
  dark: {
    text: '#E6EAF0',
    background: '#0B0D10',
    backgroundElement: '#14181D',
    backgroundSelected: '#1F2630',
    textSecondary: '#9BA5B3',
    border: '#2B333D',
    controlBorder: '#6B7684',
    accent: '#5B93F0',
    accentFill: '#2F6FDC',
    accentSoft: 'rgba(91, 147, 240, 0.14)',
    onAccent: '#FFFFFF',
    silver: '#C5CCD6',
    success: '#4CC97E',
    danger: '#FF7B72',
    warning: '#E8B04A',
    focus: '#8DB8FF',
  },
} as const;

export type Palette = {
  [K in keyof (typeof Colors)['light']]: string;
};

type Surface = Pick<
  Palette,
  | 'text'
  | 'background'
  | 'backgroundElement'
  | 'backgroundSelected'
  | 'textSecondary'
  | 'border'
  | 'controlBorder'
  | 'silver'
  | 'focus'
>;

/** Superficies, texto y bordes de cada nivel de contraste (el normal es la paleta base). */
const SURFACES: Record<SchemeName, Record<Exclude<ContrastLevel, 'normal'>, Surface>> = {
  light: {
    high: {
      text: '#000000',
      background: '#FFFFFF',
      backgroundElement: '#F5F7FA',
      backgroundSelected: '#DCE3EC',
      textSecondary: '#2E3744',
      border: '#5A6575',
      controlBorder: '#2E3744',
      silver: '#4A5565',
      focus: '#0A2A7A',
    },
    veryHigh: {
      text: '#000000',
      background: '#FFFFFF',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E4E4E4',
      textSecondary: '#1A1A1A',
      border: '#000000',
      controlBorder: '#000000',
      silver: '#1A1A1A',
      focus: '#0000CC',
    },
  },
  dark: {
    high: {
      text: '#FFFFFF',
      background: '#05070A',
      backgroundElement: '#0F141A',
      backgroundSelected: '#242C38',
      textSecondary: '#D5DBE4',
      border: '#8A95A5',
      controlBorder: '#B0B9C6',
      silver: '#E0E5EC',
      focus: '#FFFFFF',
    },
    veryHigh: {
      text: '#FFFFFF',
      background: '#000000',
      backgroundElement: '#000000',
      backgroundSelected: '#1C1C1C',
      textSecondary: '#F2F2F2',
      border: '#FFFFFF',
      controlBorder: '#FFFFFF',
      silver: '#FFFFFF',
      focus: '#FFE600',
    },
  },
};

type Status = { success: string; danger: string; warning: string };
type StatusFamily = 'default' | 'blueOrange';

/**
 * Colores de estado. Para protanopía y deuteranopía se evita el par
 * rojo/verde y se usa azul/naranja (criterio Okabe-Ito).
 */
const STATUS: Record<SchemeName, Record<ContrastLevel, Record<StatusFamily, Status>>> = {
  light: {
    normal: {
      default: { success: '#1B7A43', danger: '#B3261E', warning: '#8A5300' },
      blueOrange: { success: '#0B64A8', danger: '#B04500', warning: '#3F3500' },
    },
    high: {
      default: { success: '#0B5D2E', danger: '#9B1C14', warning: '#6B4200' },
      blueOrange: { success: '#074F8A', danger: '#8F3A00', warning: '#2F2800' },
    },
    veryHigh: {
      default: { success: '#064B22', danger: '#8A0F0A', warning: '#5C3800' },
      blueOrange: { success: '#053F70', danger: '#933600', warning: '#2E2700' },
    },
  },
  dark: {
    normal: {
      default: { success: '#4CC97E', danger: '#FF7B72', warning: '#E8B04A' },
      blueOrange: { success: '#6CB6FF', danger: '#FF8A33', warning: '#FFE35C' },
    },
    high: {
      default: { success: '#6EE19A', danger: '#FF9A92', warning: '#FFD27A' },
      blueOrange: { success: '#8CC8FF', danger: '#FFB070', warning: '#F2E26A' },
    },
    veryHigh: {
      default: { success: '#8AF0B0', danger: '#FFB0AA', warning: '#FFE08F' },
      blueOrange: { success: '#A8D6FF', danger: '#FFC08A', warning: '#FFF08A' },
    },
  },
};

type AccentFamily = 'blue' | 'violet';
type Accent = { accent: string; accentFill: string; accentSoft: string };

/** Para tritanopía el azul se confunde con el verde de éxito, así que el acento pasa a violeta. */
const ACCENTS: Record<SchemeName, Record<ContrastLevel, Record<AccentFamily, Accent>>> = {
  light: {
    normal: {
      blue: { accent: '#1F5CBF', accentFill: '#1F5CBF', accentSoft: 'rgba(31, 92, 191, 0.08)' },
      violet: { accent: '#7B35B5', accentFill: '#7B35B5', accentSoft: 'rgba(123, 53, 181, 0.08)' },
    },
    high: {
      blue: { accent: '#123C94', accentFill: '#123C94', accentSoft: 'rgba(18, 60, 148, 0.08)' },
      violet: { accent: '#5E2490', accentFill: '#5E2490', accentSoft: 'rgba(94, 36, 144, 0.08)' },
    },
    veryHigh: {
      blue: { accent: '#0A2A8A', accentFill: '#0A2A8A', accentSoft: 'rgba(10, 42, 138, 0.06)' },
      violet: { accent: '#4A1675', accentFill: '#4A1675', accentSoft: 'rgba(74, 22, 117, 0.06)' },
    },
  },
  dark: {
    normal: {
      blue: { accent: '#5B93F0', accentFill: '#2F6FDC', accentSoft: 'rgba(91, 147, 240, 0.14)' },
      violet: { accent: '#C79CF0', accentFill: '#7B3FC0', accentSoft: 'rgba(199, 156, 240, 0.14)' },
    },
    high: {
      blue: { accent: '#82B4FF', accentFill: '#164CB0', accentSoft: 'rgba(130, 180, 255, 0.1)' },
      violet: { accent: '#D6B4F7', accentFill: '#6A2DB0', accentSoft: 'rgba(214, 180, 247, 0.12)' },
    },
    veryHigh: {
      blue: { accent: '#9CC4FF', accentFill: '#1747A6', accentSoft: 'rgba(156, 196, 255, 0.1)' },
      violet: { accent: '#E0C4FA', accentFill: '#5A2299', accentSoft: 'rgba(224, 196, 250, 0.1)' },
    },
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function channelToLinear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToChannel(linear: number) {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** Luminancia relativa WCAG de un color #RRGGBB. */
export function relativeLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores #RRGGBB. */
export function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

function toGray(hex: string) {
  const channel = linearToChannel(relativeLuminance(hex))
    .toString(16)
    .padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

/** Estados en escala de grises: se distinguen por luminosidad, icono y texto. */
const GRAY_STATUS: Record<SchemeName, Record<ContrastLevel, Status>> = {
  light: {
    normal: { success: '#4A4A4A', danger: '#111111', warning: '#6B6B6B' },
    high: { success: '#3A3A3A', danger: '#000000', warning: '#4A4A4A' },
    veryHigh: { success: '#2E2E2E', danger: '#000000', warning: '#4A4A4A' },
  },
  dark: {
    normal: { success: '#B5B5B5', danger: '#F2F2F2', warning: '#8F8F8F' },
    high: { success: '#C8C8C8', danger: '#FFFFFF', warning: '#A8A8A8' },
    veryHigh: { success: '#D8D8D8', danger: '#FFFFFF', warning: '#BDBDBD' },
  },
};

const GRAY_ACCENT: Record<SchemeName, Record<ContrastLevel, { accent: string; accentFill: string }>> = {
  light: {
    normal: { accent: '#454545', accentFill: '#454545' },
    high: { accent: '#2E2E2E', accentFill: '#2E2E2E' },
    veryHigh: { accent: '#141414', accentFill: '#141414' },
  },
  dark: {
    normal: { accent: '#B8B8B8', accentFill: '#585858' },
    high: { accent: '#CFCFCF', accentFill: '#444444' },
    veryHigh: { accent: '#E0E0E0', accentFill: '#383838' },
  },
};

export type PaletteOptions = {
  scheme: SchemeName;
  contrast: ContrastLevel;
  colorMode: ColorMode;
};

/** Devuelve la paleta final según tema, contraste y modo de color. */
export function buildPalette({ scheme, contrast, colorMode }: PaletteOptions): Palette {
  const base: Palette = { ...Colors[scheme] };

  if (contrast !== 'normal') {
    Object.assign(base, SURFACES[scheme][contrast]);
  }

  if (colorMode === 'grayscale') {
    const gray = { ...base, ...GRAY_STATUS[scheme][contrast] };
    for (const key of [
      'text',
      'background',
      'backgroundElement',
      'backgroundSelected',
      'textSecondary',
      'border',
      'controlBorder',
      'silver',
      'focus',
    ] as const) {
      gray[key] = toGray(gray[key]);
    }
    gray.accent = GRAY_ACCENT[scheme][contrast].accent;
    gray.accentFill = GRAY_ACCENT[scheme][contrast].accentFill;
    gray.accentSoft =
      scheme === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.1)';
    return gray;
  }

  const family: StatusFamily =
    colorMode === 'protanopia' || colorMode === 'deuteranopia'
      ? 'blueOrange'
      : 'default';
  const accentFamily: AccentFamily = colorMode === 'tritanopia' ? 'violet' : 'blue';

  return {
    ...base,
    ...STATUS[scheme][contrast][family],
    ...ACCENTS[scheme][contrast][accentFamily],
  };
}
