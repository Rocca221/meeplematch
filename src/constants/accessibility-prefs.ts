/**
 * Preferencias de accesibilidad: tipos, valores por defecto, validación y
 * funciones de escala. Archivo puro (sin React Native) para poder probarlo.
 */
import type { ColorMode, ContrastLevel } from '@/constants/palettes';

/** Quita `readonly` de un tipo (los estilos de React Native son de solo lectura). */
export type Writable<T> = { -readonly [K in keyof T]: T[K] };

export type AccessibilityPrefs = {
  /** Multiplicador del tamaño de texto (0.85 a 2). */
  textScale: number;
  colorMode: ColorMode;
  contrast: ContrastLevel;
  reduceMotion: boolean;
  /** Botones e iconos más grandes y con más área de pulsación. */
  largeControls: boolean;
  /** Respetar las preferencias de accesibilidad del sistema operativo. */
  followSystem: boolean;
  /** Marca de tiempo (ms) del último cambio; sirve para sincronizar con la cuenta. */
  updatedAt: number;
};

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 2;
export const TEXT_SCALE_STEP = 0.05;

export const TEXT_PRESETS = [
  { id: 'normal', scale: 1 },
  { id: 'large', scale: 1.25 },
  { id: 'xlarge', scale: 1.5 },
] as const;

export const DEFAULT_PREFS: AccessibilityPrefs = {
  textScale: 1,
  colorMode: 'none',
  contrast: 'normal',
  reduceMotion: false,
  largeControls: false,
  followSystem: true,
  updatedAt: 0,
};

export const COLOR_MODES: readonly ColorMode[] = [
  'none',
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'grayscale',
];
export const CONTRAST_LEVELS: readonly ContrastLevel[] = ['normal', 'high', 'veryHigh'];

/** Señales de accesibilidad del sistema operativo. */
export type SystemA11y = {
  reduceMotion: boolean;
  highContrast: boolean;
  /** Escala de fuente del sistema (solo móvil; en web siempre 1). */
  fontScale: number;
};

export const DEFAULT_SYSTEM: SystemA11y = {
  reduceMotion: false,
  highContrast: false,
  fontScale: 1,
};

export function clampTextScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  const stepped = Math.round(value / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
  const clamped = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, stepped));
  return Math.round(clamped * 100) / 100;
}

/** Valida datos leídos del almacenamiento o de la cuenta; ignora campos inválidos. */
export function sanitizePrefs(raw: unknown): AccessibilityPrefs {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    textScale:
      typeof value.textScale === 'number'
        ? clampTextScale(value.textScale)
        : DEFAULT_PREFS.textScale,
    colorMode: COLOR_MODES.includes(value.colorMode as ColorMode)
      ? (value.colorMode as ColorMode)
      : DEFAULT_PREFS.colorMode,
    contrast: CONTRAST_LEVELS.includes(value.contrast as ContrastLevel)
      ? (value.contrast as ContrastLevel)
      : DEFAULT_PREFS.contrast,
    reduceMotion:
      typeof value.reduceMotion === 'boolean'
        ? value.reduceMotion
        : DEFAULT_PREFS.reduceMotion,
    largeControls:
      typeof value.largeControls === 'boolean'
        ? value.largeControls
        : DEFAULT_PREFS.largeControls,
    followSystem:
      typeof value.followSystem === 'boolean'
        ? value.followSystem
        : DEFAULT_PREFS.followSystem,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0,
  };
}

export type EffectiveA11y = {
  /** Escala final aplicada al texto (preferencia × escala del sistema si se respeta). */
  textScale: number;
  contrast: ContrastLevel;
  colorMode: ColorMode;
  reduceMotion: boolean;
  largeControls: boolean;
  /** Tamaño mínimo de objetivos táctiles, en px. */
  minTarget: number;
};

const CONTRAST_ORDER: ContrastLevel[] = ['normal', 'high', 'veryHigh'];

/** Combina las preferencias del usuario con las del sistema. */
export function resolveEffective(
  prefs: AccessibilityPrefs,
  system: SystemA11y,
): EffectiveA11y {
  const follow = prefs.followSystem;
  const contrast =
    follow && system.highContrast
      ? CONTRAST_ORDER[Math.max(1, CONTRAST_ORDER.indexOf(prefs.contrast))]
      : prefs.contrast;
  const reduceMotion = prefs.reduceMotion || (follow && system.reduceMotion);
  const systemFont = follow ? Math.min(2, Math.max(1, system.fontScale)) : 1;
  const textScale = Math.round(prefs.textScale * systemFont * 100) / 100;
  return {
    textScale,
    contrast,
    colorMode: prefs.colorMode,
    reduceMotion,
    largeControls: prefs.largeControls,
    minTarget: prefs.largeControls ? 56 : 44,
  };
}

/**
 * Escala un tamaño de fuente. Los títulos grandes crecen menos que el texto
 * corrido para que no desborden la pantalla y se conserve la jerarquía.
 */
export function scaleFont(size: number, scale: number) {
  if (scale === 1) return size;
  const damping = size >= 40 ? 0.5 : size >= 28 ? 0.7 : size >= 20 ? 0.85 : 1;
  return Math.round(size * (1 + (scale - 1) * damping) * 10) / 10;
}

/** Escala la altura de línea manteniendo la proporción con la fuente. */
export function scaleLineHeight(lineHeight: number, size: number, scale: number) {
  if (scale === 1) return lineHeight;
  const ratio = lineHeight / size;
  return Math.round(scaleFont(size, scale) * Math.max(ratio, 1.25) * 10) / 10;
}
