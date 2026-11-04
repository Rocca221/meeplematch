import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LocalizedTextInput } from '@/components/localized-text-input';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocationSuggestions } from '@/hooks/use-location-suggestions';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

type Props = {
  label: string;
  value: string;
  placeholder: string;
  borderColor: string;
  onChangeText: (value: string) => void;
  onSelect: (suggestion: string) => void;
};

export function LocationAutocompleteField({
  label,
  value,
  placeholder,
  borderColor,
  onChangeText,
  onSelect,
}: Props) {
  const theme = useTheme();
  const { language } = useLanguage();
  const { suggestions, loading, error } = useLocationSuggestions(value, language);
  const [selectedValue, setSelectedValue] = useState('');
  const showSuggestions = value.trim().length >= 3 && value !== selectedValue;

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <LocalizedTextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(nextValue) => {
          setSelectedValue('');
          onChangeText(nextValue);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, borderColor },
        ]}
      />
      {showSuggestions && loading ? (
        <ThemedText type="small" themeColor="textSecondary">
          Buscando ubicaciones...
        </ThemedText>
      ) : null}
      {showSuggestions && error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : null}
      {showSuggestions
        ? suggestions.map((suggestion) => (
            <Pressable
              key={`${suggestion.label}:${suggestion.coordinates.join(',')}`}
              accessibilityRole="button"
              onPress={() => {
                setSelectedValue(suggestion.label);
                onSelect(suggestion.label);
              }}
              style={[styles.suggestion, { borderColor }]}>
              <ThemedText type="smallBold">{suggestion.label}</ThemedText>
            </Pressable>
          ))
        : null}
      {showSuggestions && !loading && !error && !suggestions.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          No se encontraron ubicaciones. Prueba con otro nombre.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  suggestion: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
  },
  error: {
    color: '#C73535',
  },
});
