import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemePreference } from '@/providers/theme-preference-provider';

export function useEffectiveColorScheme() {
  const systemScheme = useColorScheme();
  const { preference } = useThemePreference();

  if (preference === 'system') return systemScheme;
  return preference;
}
