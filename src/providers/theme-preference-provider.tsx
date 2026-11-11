import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  storageError: string;
};

const STORAGE_KEY = 'meeplematch.theme-preference';
const ThemePreferenceContext =
  createContext<ThemePreferenceContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedPreference) => {
        if (active && isThemePreference(storedPreference)) {
          setPreferenceState(storedPreference);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStorageError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar la preferencia de tema.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setStorageError('');
    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
      setPreferenceState(nextPreference);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la preferencia de tema.';
      setStorageError(message);
      throw error;
    }
  }, []);

  return (
    <ThemePreferenceContext.Provider
      value={{ preference, setPreference, storageError }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);

  if (!context) {
    throw new Error(
      'useThemePreference must be used within a ThemePreferenceProvider.',
    );
  }

  return context;
}
