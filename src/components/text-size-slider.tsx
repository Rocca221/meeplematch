import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';
import { ThemedText } from '@/components/themed-text';
import {
  clampTextScale,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SCALE_STEP,
} from '@/constants/accessibility-prefs';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/providers/language-provider';

type TextSizeSliderProps = {
  value: number;
  onChange: (value: number) => void;
};

/**
 * Control deslizante del tamaño de texto. Se puede arrastrar, tocar la barra,
 * usar las flechas/Inicio/Fin/RePág/AvPág del teclado, o los botones − y +,
 * así que no exige movimientos precisos.
 */
export function TextSizeSlider({ value, onChange }: TextSizeSliderProps) {
  const theme = useTheme();
  const { language } = useLanguage();
  const [width, setWidth] = useState(0);

  const ratio = (value - TEXT_SCALE_MIN) / (TEXT_SCALE_MAX - TEXT_SCALE_MIN);
  const percent = Math.round(value * 100);
  const valueText = language === 'en' ? `${percent} percent` : `${percent} por ciento`;

  const setFromX = (x: number) => {
    if (width <= 0) return;
    const next = TEXT_SCALE_MIN + Math.min(1, Math.max(0, x / width)) *
      (TEXT_SCALE_MAX - TEXT_SCALE_MIN);
    onChange(clampTextScale(next));
  };

  const step = (direction: 1 | -1, multiplier = 1) =>
    onChange(clampTextScale(value + direction * TEXT_SCALE_STEP * multiplier));

  const keyboardProps =
    Platform.OS === 'web'
      ? ({
          onKeyDown: (event: { key: string; preventDefault: () => void }) => {
            const actions: Record<string, () => void> = {
              ArrowRight: () => step(1),
              ArrowUp: () => step(1),
              ArrowLeft: () => step(-1),
              ArrowDown: () => step(-1),
              PageUp: () => step(1, 4),
              PageDown: () => step(-1, 4),
              Home: () => onChange(TEXT_SCALE_MIN),
              End: () => onChange(TEXT_SCALE_MAX),
            };
            const action = actions[event.key];
            if (action) {
              event.preventDefault();
              action();
            }
          },
        } as object)
      : null;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={language === 'en' ? 'Decrease text size' : 'Reducir tamaño del texto'}
        disabled={value <= TEXT_SCALE_MIN}
        onPress={() => step(-1)}
        style={[styles.stepButton, { borderColor: theme.border }]}>
        <ThemedText type="smallBold">A−</ThemedText>
      </Pressable>

      <View
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel={language === 'en' ? 'Text size' : 'Tamaño del texto'}
        accessibilityValue={{
          min: Math.round(TEXT_SCALE_MIN * 100),
          max: Math.round(TEXT_SCALE_MAX * 100),
          now: percent,
          text: valueText,
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') step(1);
          if (event.nativeEvent.actionName === 'decrement') step(-1);
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => setFromX(event.nativeEvent.locationX)}
        onResponderMove={(event) => setFromX(event.nativeEvent.locationX)}
        style={styles.trackArea}
        {...keyboardProps}>
        <View
          pointerEvents="none"
          style={[styles.track, { backgroundColor: theme.backgroundSelected, borderColor: theme.controlBorder }]}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: theme.accentFill }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: Math.max(0, Math.min(width - 28, ratio * width - 14)),
              backgroundColor: theme.accentFill,
              borderColor: theme.background,
            },
          ]}
        />
      </View>

      <Pressable
        accessibilityLabel={language === 'en' ? 'Increase text size' : 'Aumentar tamaño del texto'}
        disabled={value >= TEXT_SCALE_MAX}
        onPress={() => step(1)}
        style={[styles.stepButton, { borderColor: theme.border }]}>
        <ThemedText type="smallBold">A+</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepButton: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
  trackArea: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  track: {
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
  },
});
