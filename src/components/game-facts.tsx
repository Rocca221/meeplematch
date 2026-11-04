import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

type GameFactsProps = {
  minPlayers?: number | null;
  maxPlayers?: number | null;
  minutes?: number | null;
  year?: number | string | null;
  minAge?: number | null;
};

/**
 * Datos de un juego (jugadores, duración, edad, año) con icono y etiqueta
 * escrita cada uno, para que se distingan sin depender del color.
 */
export function GameFacts({ minPlayers, maxPlayers, minutes, year, minAge }: GameFactsProps) {
  const theme = useTheme();
  const { language } = useLanguage();
  const en = language === 'en';

  const players =
    minPlayers && maxPlayers
      ? minPlayers === maxPlayers
        ? `${minPlayers}`
        : `${minPlayers}–${maxPlayers}`
      : minPlayers
        ? `${minPlayers}+`
        : null;

  const facts = [
    players
      ? { icon: '👥', label: `${players} ${en ? 'players' : 'jugadores'}`, name: en ? 'Players' : 'Jugadores' }
      : null,
    minutes
      ? { icon: '⏱', label: `${minutes} min`, name: en ? 'Duration' : 'Duración' }
      : null,
    minAge ? { icon: '🎂', label: `${minAge}+`, name: en ? 'Age' : 'Edad' } : null,
    year ? { icon: '📅', label: String(year), name: en ? 'Year' : 'Año' } : null,
  ].filter((fact): fact is { icon: string; label: string; name: string } => Boolean(fact));

  if (!facts.length) return null;

  return (
    <View style={styles.row}>
      {facts.map((fact) => (
        <View
          key={fact.name}
          accessible
          accessibilityLabel={`${fact.name}: ${fact.label}`}
          style={[styles.fact, { borderColor: theme.border }]}>
          <ThemedText
            accessibilityElementsHidden
            importantForAccessibility="no"
            type="small">
            {fact.icon}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {fact.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
  },
});
