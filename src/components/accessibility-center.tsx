import { type ReactNode, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Pressable } from '@/components/accessible-pressable';
import { Choice } from '@/components/choice';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TEXT_PRESETS } from '@/constants/accessibility-prefs';
import type { ColorMode, ContrastLevel } from '@/constants/palettes';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility, type SyncStatus } from '@/providers/accessibility-provider';
import { useLanguage } from '@/providers/language-provider';

type AccessibilityCenterProps = {
  /** Versión corta (pantalla de acceso): solo texto, contraste, color y movimiento. */
  compact?: boolean;
};

/**
 * Centro de accesibilidad. Todos los cambios se aplican y guardan al instante.
 * Lo usan Perfil (completo) y la pantalla de acceso (compacto).
 */
export function AccessibilityCenter({ compact = false }: AccessibilityCenterProps) {
  const { prefs, effective, system, update, reset, syncStatus, storageError } =
    useAccessibility();
  const { language } = useLanguage();
  const theme = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const t = (es: string, en: string) => (language === 'en' ? en : es);

  const contrastOptions: { id: ContrastLevel; label: string; description: string }[] = [
    {
      id: 'normal',
      label: t('Contraste normal', 'Normal contrast'),
      description: t('El aspecto habitual de MeepleMatch.', 'The usual MeepleMatch look.'),
    },
    {
      id: 'high',
      label: t('Contraste alto', 'High contrast'),
      description: t(
        'Texto más oscuro o claro y bordes marcados.',
        'Stronger text colours and visible borders.',
      ),
    },
    {
      id: 'veryHigh',
      label: t('Contraste muy alto', 'Very high contrast'),
      description: t(
        'Blanco y negro puros con bordes completos.',
        'Pure black and white with full borders.',
      ),
    },
  ];

  const colorOptions: { id: ColorMode; label: string; description: string }[] = [
    {
      id: 'none',
      label: t('Colores originales', 'Original colours'),
      description: t('Sin adaptación.', 'No adjustment.'),
    },
    {
      id: 'protanopia',
      label: t('Protanopía', 'Protanopia'),
      description: t(
        'Dificultad con rojos. Usa azul y naranja para los estados.',
        'Trouble with reds. Uses blue and orange for statuses.',
      ),
    },
    {
      id: 'deuteranopia',
      label: t('Deuteranopía', 'Deuteranopia'),
      description: t(
        'Dificultad con verdes. Usa azul y naranja para los estados.',
        'Trouble with greens. Uses blue and orange for statuses.',
      ),
    },
    {
      id: 'tritanopia',
      label: t('Tritanopía', 'Tritanopia'),
      description: t(
        'Dificultad con azules y amarillos. El acento pasa a violeta.',
        'Trouble with blues and yellows. The accent becomes violet.',
      ),
    },
    {
      id: 'grayscale',
      label: t('Escala de grises', 'Grayscale'),
      description: t(
        'Quita todo el color. Los estados se distinguen por icono y texto.',
        'Removes all colour. Statuses are told apart by icon and text.',
      ),
    },
  ];

  const percent = Math.round(effective.textScale * 100);
  const activePreset = TEXT_PRESETS.find((preset) => preset.scale === prefs.textScale)?.id;
  const presetLabels: Record<(typeof TEXT_PRESETS)[number]['id'], string> = {
    normal: t('Texto normal', 'Normal text'),
    large: t('Texto grande', 'Large text'),
    xlarge: t('Texto muy grande', 'Very large text'),
  };

  const syncText: Record<SyncStatus, string> = {
    local: t(
      'Tus ajustes se guardan en este dispositivo. Inicia sesión para sincronizarlos con tu cuenta.',
      'Your settings are saved on this device. Sign in to sync them with your account.',
    ),
    syncing: t('Sincronizando con tu cuenta…', 'Syncing with your account…'),
    synced: t(
      'Tus ajustes están guardados y sincronizados con tu cuenta.',
      'Your settings are saved and synced with your account.',
    ),
    unavailable: t(
      'Tus ajustes se guardaron en este dispositivo, pero no se pudieron sincronizar con tu cuenta. Se reintentará al cambiarlos de nuevo.',
      'Your settings were saved on this device but could not be synced with your account. We will retry on your next change.',
    ),
  };

  const systemNotes = [
    system.reduceMotion ? t('reducir movimiento', 'reduce motion') : null,
    system.highContrast ? t('alto contraste', 'high contrast') : null,
    system.fontScale > 1 ? t('texto más grande', 'larger text') : null,
  ].filter(Boolean);

  return (
    <View style={styles.root}>
      <ThemedText type="subtitle" accessibilityRole="header">
        {t('Accesibilidad', 'Accessibility')}
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        {t(
          'Adapta MeepleMatch a tu forma de usarlo. Los cambios se aplican al instante y se guardan solos.',
          'Adapt MeepleMatch to the way you use it. Changes apply instantly and are saved automatically.',
        )}
      </ThemedText>

      {/* Texto */}
      <Section title={t('Tamaño del texto', 'Text size')}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Tamaño del texto', 'Text size')} style={styles.stack}>
          {TEXT_PRESETS.map((preset) => (
            <Choice
              key={preset.id}
              label={presetLabels[preset.id]}
              description={`${Math.round(preset.scale * 100)} %`}
              selected={activePreset === preset.id}
              onPress={() => update({ textScale: preset.scale })}
            />
          ))}
        </View>
      </Section>

      {/* Contraste */}
      <Section title={t('Contraste', 'Contrast')}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Contraste', 'Contrast')} style={styles.stack}>
          {contrastOptions.map((option) => (
            <Choice
              key={option.id}
              label={option.label}
              description={option.description}
              selected={prefs.contrast === option.id}
              onPress={() => update({ contrast: option.id })}
            />
          ))}
        </View>
      </Section>

      {/* Daltonismo */}
      <Section title={t('Modo para daltonismo', 'Colour-blindness mode')}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Modo para daltonismo', 'Colour-blindness mode')} style={styles.stack}>
          {colorOptions.map((option) => (
            <Choice
              key={option.id}
              label={option.label}
              description={option.description}
              selected={prefs.colorMode === option.id}
              onPress={() => update({ colorMode: option.id })}
            />
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t(
            'Además de los colores, MeepleMatch siempre usa iconos y texto para indicar estados.',
            'Besides colour, MeepleMatch always uses icons and text to show statuses.',
          )}
        </ThemedText>
      </Section>

      {/* Movimiento */}
      <Section title={t('Movimiento', 'Motion')}>
        <ToggleRow
          label={t('Reducir animaciones y transiciones', 'Reduce animations and transitions')}
          description={t(
            'Quita fundidos y efectos innecesarios.',
            'Removes fades and unnecessary effects.',
          )}
          value={prefs.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
        />
      </Section>

      {!compact ? (
        <>
          <Section title={t('Controles', 'Controls')}>
            <ToggleRow
              label={t('Botones y controles grandes', 'Large buttons and controls')}
              description={t(
                'Áreas de toque de 56 px en lugar de 44 px.',
                'Touch areas of 56 px instead of 44 px.',
              )}
              value={prefs.largeControls}
              onChange={(largeControls) => update({ largeControls })}
            />
          </Section>

          <Section title={t('Preferencias del dispositivo', 'Device preferences')}>
            <ToggleRow
              label={t(
                'Respetar la accesibilidad del dispositivo',
                'Follow the device accessibility settings',
              )}
              description={t(
                'Aplica automáticamente reducción de movimiento, alto contraste y tamaño de texto del sistema.',
                'Automatically applies the system reduce-motion, high-contrast and text-size settings.',
              )}
              value={prefs.followSystem}
              onChange={(followSystem) => update({ followSystem })}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {prefs.followSystem
                ? systemNotes.length
                  ? t(
                      `Tu dispositivo tiene activado: ${systemNotes.join(', ')}.`,
                      `Your device has on: ${systemNotes.join(', ')}.`,
                    )
                  : t(
                      'Tu dispositivo no tiene ajustes de accesibilidad activados.',
                      'Your device has no accessibility settings turned on.',
                    )
                : t('Se ignoran los ajustes del dispositivo.', 'Device settings are ignored.')}
            </ThemedText>
          </Section>

          <Section title={t('Sonido y avisos', 'Sound and alerts')}>
            <ThemedText themeColor="textSecondary">
              {t(
                'MeepleMatch no usa sonidos para confirmar ni para marcar errores. Todos los avisos aparecen como texto en pantalla, con icono, y se quedan hasta que cambies de sección.',
                'MeepleMatch does not use sounds to confirm actions or flag errors. Every alert appears as on-screen text with an icon and stays until you change section.',
              )}
            </ThemedText>
          </Section>
        </>
      ) : null}

      {/* Vista previa */}
      <Section title={t('Vista previa', 'Preview')}>
        <Preview />
      </Section>

      {/* Estado y restauración */}
      <View style={styles.stack} accessibilityLiveRegion="polite">
        <ThemedText type="small" themeColor="textSecondary">
          {syncText[syncStatus]}
        </ThemedText>
        {storageError ? <StatusMessage kind="error">{storageError}</StatusMessage> : null}
        {resetDone ? (
          <StatusMessage kind="success" onDismiss={() => setResetDone(false)}>
            {t(
              'Se restauraron los valores predeterminados.',
              'Default settings were restored.',
            )}
          </StatusMessage>
        ) : null}
      </View>

      {confirmReset ? (
        <ThemedView type="backgroundSelected" style={styles.confirm}>
          <ThemedText type="smallBold">
            {t(
              '¿Restaurar todos los ajustes de accesibilidad a sus valores predeterminados?',
              'Restore all accessibility settings to their defaults?',
            )}
          </ThemedText>
          <View style={styles.confirmButtons}>
            <Pressable
              accessibilityLabel={t('Sí, restaurar', 'Yes, restore')}
              onPress={() => {
                reset();
                setConfirmReset(false);
                setResetDone(true);
              }}
              style={[styles.button, { backgroundColor: theme.accentFill }]}>
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                {t('Sí, restaurar', 'Yes, restore')}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setConfirmReset(false)}
              style={[styles.button, { borderWidth: 1, borderColor: theme.border }]}>
              <ThemedText type="smallBold">{t('Cancelar', 'Cancel')}</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      ) : (
        <Pressable
          onPress={() => {
            setResetDone(false);
            setConfirmReset(true);
          }}
          style={[styles.button, { borderWidth: 1, borderColor: theme.border }]}>
          <ThemedText type="smallBold">
            {t('Restaurar valores predeterminados', 'Restore default settings')}
          </ThemedText>
        </Pressable>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {t(
          `Ahora: texto ${percent} %, contraste ${effective.contrast === 'normal' ? 'normal' : effective.contrast === 'high' ? 'alto' : 'muy alto'}.`,
          `Now: text ${percent}%, ${effective.contrast === 'normal' ? 'normal' : effective.contrast === 'high' ? 'high' : 'very high'} contrast.`,
        )}
      </ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  const { language } = useLanguage();
  return (
    <View style={[styles.toggleRow, { borderColor: theme.border }]}>
      <View style={styles.toggleText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      <View style={styles.toggleControl}>
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onChange}
          trackColor={{ false: theme.backgroundSelected, true: theme.accentFill }}
          thumbColor={theme.onAccent}
          ios_backgroundColor={theme.backgroundSelected}
        />
        <ThemedText type="smallBold" themeColor="textSecondary">
          {value
            ? language === 'en'
              ? 'On'
              : 'Activado'
            : language === 'en'
              ? 'Off'
              : 'Desactivado'}
        </ThemedText>
      </View>
    </View>
  );
}

/** Ficha de ejemplo para ver al momento cómo quedan texto, contraste y estados. */
function Preview() {
  const theme = useTheme();
  const { language } = useLanguage();
  const t = (es: string, en: string) => (language === 'en' ? en : es);

  const facts = [
    { icon: '👥', label: t('Jugadores', 'Players'), value: '2–5' },
    { icon: '⏱', label: t('Duración', 'Duration'), value: '45 min' },
    { icon: '🎂', label: t('Edad', 'Age'), value: '8+' },
  ];
  const states = [
    { icon: '✓', text: t('Agregado', 'Added'), color: theme.success },
    { icon: '◷', text: t('Pendiente', 'Pending'), color: theme.warning },
    { icon: '✕', text: t('Eliminado', 'Removed'), color: theme.danger },
  ];

  return (
    <ThemedView type="backgroundElement" style={[styles.preview, { borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('EJEMPLO DE FICHA', 'SAMPLE CARD')}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.previewTitle}>
        Carcassonne
      </ThemedText>
      <ThemedText>
        {t(
          'Coloca losetas para construir ciudades, caminos y campos.',
          'Place tiles to build cities, roads and fields.',
        )}
      </ThemedText>
      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.label} style={[styles.fact, { borderColor: theme.border }]}>
            <ThemedText accessibilityElementsHidden importantForAccessibility="no">
              {fact.icon}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {fact.label}
            </ThemedText>
            <ThemedText type="smallBold">{fact.value}</ThemedText>
          </View>
        ))}
      </View>
      <View style={styles.facts}>
        {states.map((state) => (
          <View key={state.text} style={[styles.state, { borderColor: state.color }]}>
            <ThemedText type="smallBold" style={{ color: state.color }}>
              {state.icon}
            </ThemedText>
            <ThemedText type="smallBold">{state.text}</ThemedText>
          </View>
        ))}
      </View>
      <View style={[styles.sampleButton, { backgroundColor: theme.accentFill }]}>
        <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
          {t('Botón de ejemplo', 'Sample button')}
        </ThemedText>
      </View>
      <StatusMessage kind="error">
        {t(
          'Así se ve un error: explica qué pasó y cómo solucionarlo.',
          'This is how an error looks: it explains what happened and how to fix it.',
        )}
      </StatusMessage>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 0.5,
  },
  stack: {
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
  },
  toggleText: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  toggleControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  preview: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: 12,
  },
  previewTitle: {
    fontSize: 26,
    lineHeight: 34,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  sampleButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  confirm: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  confirmButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
