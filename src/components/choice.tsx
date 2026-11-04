import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChoiceProps = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** `radio` para una opción única dentro de un grupo; `button` para el resto. */
  role?: 'radio' | 'button';
};

/**
 * Opción seleccionable. El estado se ve por tres vías a la vez: marca ●/○,
 * borde más grueso y la propiedad de accesibilidad "seleccionado".
 */
export function Choice({ label, description, selected, onPress, role = 'radio' }: ChoiceProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { checked: selected } : { selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderColor: selected ? theme.accent : theme.border,
          borderWidth: selected ? 2 : 1,
          backgroundColor: selected ? theme.accentSoft : 'transparent',
        },
      ]}>
      <ThemedText
        accessibilityElementsHidden
        importantForAccessibility="no"
        type="smallBold"
        style={{ color: selected ? theme.accent : theme.textSecondary }}>
        {selected ? '●' : '○'}
      </ThemedText>
      <View style={styles.text}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Marca ✓ que acompaña a una opción elegida en botones que ya existen. */
export function SelectedMark({ selected }: { selected: boolean }) {
  const theme = useTheme();
  if (!selected) return null;
  return (
    <ThemedText
      accessibilityElementsHidden
      importantForAccessibility="no"
      type="smallBold"
      style={{ color: theme.accent }}>
      ✓
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  text: {
    flexShrink: 1,
    gap: 2,
  },
});
