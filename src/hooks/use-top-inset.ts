import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { TopInset } from '@/constants/theme';

/**
 * Altura real de la barra superior de la web. Cambia cuando el usuario agranda
 * el texto o la barra se parte en dos líneas, así el contenido nunca queda debajo.
 */
let measured = 0;
const listeners = new Set<() => void>();

export function setNavInset(height: number) {
  const next = Math.ceil(height);
  if (next === measured) return;
  measured = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTopInset() {
  const value = useSyncExternalStore(
    subscribe,
    () => measured,
    () => 0,
  );
  if (Platform.OS !== 'web') return 0;
  return value || TopInset;
}
