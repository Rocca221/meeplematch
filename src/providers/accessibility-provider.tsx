import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, AppState, Platform, useWindowDimensions } from 'react-native';

import {
  type AccessibilityPrefs,
  DEFAULT_PREFS,
  DEFAULT_SYSTEM,
  type EffectiveA11y,
  resolveEffective,
  sanitizePrefs,
  type SystemA11y,
} from '@/constants/accessibility-prefs';
import { buildPalette } from '@/constants/palettes';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Estado de la sincronización con la cuenta, para mostrarlo como texto. */
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'unavailable';

type AccessibilityContextValue = {
  prefs: AccessibilityPrefs;
  effective: EffectiveA11y;
  system: SystemA11y;
  /** Cambia una o varias preferencias. Se aplican y guardan al instante. */
  update: (changes: Partial<Omit<AccessibilityPrefs, 'updatedAt'>>) => void;
  reset: () => void;
  syncStatus: SyncStatus;
  /** Último error de almacenamiento, en lenguaje claro ('' si no hay). */
  storageError: string;
};

const STORAGE_KEY = 'meeplematch.accessibility';
const SYNC_DELAY_MS = 800;
const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

type DeviceInfo = {
  isHighTextContrastEnabled?: () => Promise<boolean>;
  isDarkerSystemColorsEnabled?: () => Promise<boolean>;
};

async function readNativeSystem(): Promise<Partial<SystemA11y>> {
  const info = AccessibilityInfo as unknown as DeviceInfo;
  const [reduceMotion, androidContrast, iosContrast] = await Promise.all([
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
    info.isHighTextContrastEnabled?.().catch(() => false) ?? Promise.resolve(false),
    info.isDarkerSystemColorsEnabled?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  return { reduceMotion, highContrast: Boolean(androidContrast || iosContrast) };
}

export function AccessibilityProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { fontScale } = useWindowDimensions();
  const scheme = useEffectiveColorScheme() === 'dark' ? 'dark' : 'light';

  const [prefs, setPrefs] = useState<AccessibilityPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  // Resultado de la última sincronización y para qué usuario fue.
  const [sync, setSync] = useState<{ userId: string; status: 'syncing' | 'synced' | 'unavailable' } | null>(null);
  const syncStatus: SyncStatus = !userId ? 'local' : sync?.userId === userId ? sync.status : 'syncing';
  const [systemFlags, setSystemFlags] = useState<
    Pick<SystemA11y, 'reduceMotion' | 'highContrast'>
  >({ reduceMotion: false, highContrast: false });
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Cargar lo guardado en el dispositivo.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        try {
          setPrefs(sanitizePrefs(JSON.parse(stored)));
        } catch {
          setStorageError(
            'No se pudieron leer tus ajustes guardados. Se usan los valores predeterminados.',
          );
        }
      })
      .catch(() => {
        if (active) {
          setStorageError(
            'No se pudieron cargar tus ajustes de accesibilidad guardados en este dispositivo.',
          );
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // 2. Preferencias del sistema operativo.
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const contrast = window.matchMedia('(prefers-contrast: more)');
      const read = () =>
        setSystemFlags({ reduceMotion: motion.matches, highContrast: contrast.matches });
      read();
      motion.addEventListener('change', read);
      contrast.addEventListener('change', read);
      return () => {
        motion.removeEventListener('change', read);
        contrast.removeEventListener('change', read);
      };
    }

    let active = true;
    const read = () => {
      void readNativeSystem().then((next) => {
        if (active) setSystemFlags((current) => ({ ...current, ...next }));
      });
    };
    read();
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) =>
      setSystemFlags((current) => ({ ...current, reduceMotion: value })),
    );
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      active = false;
      motionSub.remove();
      appSub.remove();
    };
  }, []);

  const system = useMemo<SystemA11y>(
    () => ({
      ...DEFAULT_SYSTEM,
      ...systemFlags,
      fontScale: Platform.OS === 'web' ? 1 : fontScale,
    }),
    [systemFlags, fontScale],
  );
  const effective = useMemo(() => resolveEffective(prefs, system), [prefs, system]);

  // 3. Aplicar en web: atributos y variables CSS (foco visible, movimiento, filtro de grises).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    const palette = buildPalette({
      scheme,
      contrast: effective.contrast,
      colorMode: effective.colorMode,
    });
    root.dataset.contrast = effective.contrast;
    root.dataset.colorMode = effective.colorMode;
    root.dataset.reduceMotion = String(effective.reduceMotion);
    root.dataset.largeControls = String(effective.largeControls);
    root.style.setProperty('--mm-focus', palette.focus);
    root.style.setProperty('--mm-text-scale', String(effective.textScale));
    root.style.filter = effective.colorMode === 'grayscale' ? 'grayscale(1)' : '';
  }, [effective, scheme]);

  // 4. Guardado local y sincronización diferida con la cuenta.
  const persist = useCallback(
    (next: AccessibilityPrefs) => {
      setStorageError('');
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        setStorageError(
          'No se pudieron guardar los ajustes en este dispositivo. Siguen activos hasta que cierres la app.',
        );
      });

      if (!userId) return;
      setSync({ userId, status: 'syncing' });
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        void supabase
          .from('profiles')
          .update({ accessibility_prefs: next })
          .eq('id', userId)
          .then(({ error }) => setSync({ userId, status: error ? 'unavailable' : 'synced' }));
      }, SYNC_DELAY_MS);
    },
    [userId],
  );

  const update = useCallback<AccessibilityContextValue['update']>(
    (changes) => {
      const next = sanitizePrefs({ ...prefs, ...changes, updatedAt: Date.now() });
      setPrefs(next);
      persist(next);
    },
    [persist, prefs],
  );

  const reset = useCallback(() => {
    const next = { ...DEFAULT_PREFS, updatedAt: Date.now() };
    setPrefs(next);
    persist(next);
  }, [persist]);

  // 5. Al iniciar sesión, adoptar lo más reciente entre el dispositivo y la cuenta.
  useEffect(() => {
    if (!userId || !loaded) return;

    let active = true;
    void supabase
      .from('profiles')
      .select('accessibility_prefs')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSync({ userId, status: 'unavailable' });
          return;
        }
        const remoteRaw = (data as { accessibility_prefs?: unknown } | null)
          ?.accessibility_prefs;
        const local = prefsRef.current;
        if (remoteRaw && typeof remoteRaw === 'object') {
          const remote = sanitizePrefs(remoteRaw);
          if (remote.updatedAt > local.updatedAt) {
            setPrefs(remote);
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote)).catch(() => undefined);
            setSync({ userId, status: 'synced' });
            return;
          }
        }
        if (local.updatedAt > 0) {
          void supabase
            .from('profiles')
            .update({ accessibility_prefs: local })
            .eq('id', userId)
            .then(({ error: pushError }) => {
              if (active) setSync({ userId, status: pushError ? 'unavailable' : 'synced' });
            });
        } else {
          setSync({ userId, status: 'synced' });
        }
      });
    return () => {
      active = false;
    };
  }, [loaded, userId]);

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const value = useMemo(
    () => ({ prefs, effective, system, update, reset, syncStatus, storageError }),
    [prefs, effective, system, update, reset, syncStatus, storageError],
  );

  return (
    <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider.');
  }
  return context;
}
