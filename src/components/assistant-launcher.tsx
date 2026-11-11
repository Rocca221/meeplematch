import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/accessible-pressable';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import {
  type AssistantAction,
  type ChatItem,
  type PendingAction,
  useAssistant,
} from '@/providers/assistant-provider';
import { useLanguage } from '@/providers/language-provider';

const WIDE_BREAKPOINT = 900;
const PANEL_WIDTH = 440;

function useT() {
  const { language } = useLanguage();
  return (es: string, en: string) => (language === 'en' ? en : es);
}

/** Botón flotante que abre el asistente desde cualquier pantalla. */
export function AssistantLauncher() {
  const { open, setOpen } = useAssistant();
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <>
      {!open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Abrir el asistente de IA', 'Open the AI assistant')}
          accessibilityHint={t(
            'Puede buscar, analizar y hacer acciones en tu cuenta',
            'It can search, analyse and take actions in your account',
          )}
          onPress={() => setOpen(true)}
          style={[
            styles.fab,
            {
              backgroundColor: theme.accentFill,
              borderColor: theme.silver,
              right: Spacing.three,
              bottom:
                Platform.OS === 'web'
                  ? Spacing.four
                  : (BottomTabInset ?? 0) + insets.bottom + Spacing.three,
            },
          ]}>
          <ThemedText type="subtitle" style={[styles.fabIcon, { color: theme.onAccent }]}>
            ✦
          </ThemedText>
        </Pressable>
      ) : null}
      {open ? <AssistantPanel /> : null}
    </>
  );
}

function AssistantPanel() {
  const {
    setOpen,
    items,
    pending,
    busy,
    retry,
    clear,
    confirmAll,
    setConfirmAll,
    send,
    decideAll,
  } = useAssistant();
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const listRef = useRef<ScrollViewInstance>(null);

  // Cerrar con el botón "atrás" de Android y con Escape en la web.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (Platform.OS === 'web') window.addEventListener('keydown', onKey);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('keydown', onKey);
    };
  }, [setOpen]);

  // Al abrir el teclado, volver al final de la conversación para ver lo que se escribe.
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => subscription.remove();
  }, []);

  function submit() {
    if (!draft.trim() || busy || pending.length) return;
    send(draft);
    setDraft('');
  }

  const suggestions = [
    t('Resume mi actividad y dime qué debería hacer hoy', 'Summarise my activity and tell me what to do today'),
    t('Analiza mi biblioteca y recomiéndame juegos que me falten', 'Analyse my library and recommend games I am missing'),
    t('Busca partidas abiertas que me convengan', 'Find open games that suit me'),
    t('Agrega Azul, Wingspan y Pandemic a mi biblioteca como "los tengo"', 'Add Azul, Wingspan and Pandemic to my library as "owned"'),
    t('Ayúdame a publicar una partida en el Tablón', 'Help me post a game on the board'),
  ];

  return (
    <View style={[styles.overlay, { pointerEvents: 'box-none' }]}>
      {wide ? (
        <Pressable
          disableMinTarget
          accessibilityLabel={t('Cerrar el asistente', 'Close the assistant')}
          onPress={() => setOpen(false)}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      ) : null}

      <SafeAreaView
        role="dialog"
        aria-modal
        accessibilityViewIsModal
        accessibilityLabel={t('Asistente de IA', 'AI assistant')}
        style={[
          styles.panel,
          { backgroundColor: theme.background, borderColor: theme.border },
          wide ? styles.panelWide : styles.panelFull,
        ]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding">
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerTitle}>
              <ThemedText type="subtitle" style={styles.title}>
                ✦ {t('Asistente de IA', 'AI assistant')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('Consulta, analiza y actúa en tu cuenta', 'Searches, analyses and acts on your account')}
              </ThemedText>
            </View>
            <HeaderButton
              label={view === 'chat' ? t('Historial', 'History') : t('Chat', 'Chat')}
              onPress={() => setView(view === 'chat' ? 'history' : 'chat')}
            />
            <HeaderButton label={t('Cerrar', 'Close')} onPress={() => setOpen(false)} />
          </View>

          {view === 'history' ? (
            <ActionHistory />
          ) : (
            <>
              <View style={[styles.settings, { borderBottomColor: theme.border }]}>
                <ThemedText type="small" style={styles.settingsText}>
                  {t('Pedir confirmación para todas las acciones', 'Ask for confirmation on every action')}
                </ThemedText>
                <Switch
                  value={confirmAll}
                  onValueChange={setConfirmAll}
                  accessibilityLabel={t(
                    'Pedir confirmación para todas las acciones',
                    'Ask for confirmation on every action',
                  )}
                  trackColor={{ false: theme.controlBorder, true: theme.accentFill }}
                  thumbColor={theme.backgroundElement}
                />
                <HeaderButton
                  label={t('Nueva conversación', 'New chat')}
                  onPress={clear}
                  disabled={busy || (!items.length && !pending.length)}
                />
              </View>

              <ScrollView
                ref={listRef}
                style={styles.flex}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                accessibilityLiveRegion="polite"
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}>
                {!items.length && !pending.length ? (
                  <Welcome suggestions={suggestions} onPick={send} disabled={busy} />
                ) : null}

                {items.map((item) => (
                  <Item key={item.id} item={item} />
                ))}

                {pending.length ? <PendingCards pending={pending} /> : null}

                {busy ? (
                  <View style={styles.working} accessibilityLiveRegion="polite">
                    <ActivityIndicator accessibilityLabel={t('Cargando', 'Loading')} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('El asistente está trabajando…', 'The assistant is working…')}
                    </ThemedText>
                  </View>
                ) : null}

                {retry && !busy ? (
                  <Pressable
                    onPress={retry}
                    style={[styles.secondaryButton, { borderColor: theme.border }]}>
                    <ThemedText type="smallBold">{t('Reintentar', 'Try again')}</ThemedText>
                  </Pressable>
                ) : null}

                {pending.length > 1 && !busy ? (
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => decideAll('approve')}
                      style={[styles.primaryButton, { backgroundColor: theme.accentFill }]}>
                      <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                        {t('Aprobar todo', 'Approve all')}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => decideAll('reject')}
                      style={[styles.secondaryButton, { borderColor: theme.border }]}>
                      <ThemedText type="smallBold">{t('Rechazar todo', 'Reject all')}</ThemedText>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>

              <View style={[styles.composer, { borderTopColor: theme.border }]}>
                <LocalizedTextInput
                  value={draft}
                  onChangeText={setDraft}
                  editable={!busy && !pending.length}
                  multiline
                  maxLength={2000}
                  placeholder={
                    pending.length
                      ? t('Aprueba o rechaza la acción para continuar', 'Approve or reject the action to continue')
                      : t('Escribe lo que necesitas…', 'Type what you need…')
                  }
                  accessibilityLabel={t('Mensaje para el asistente', 'Message for the assistant')}
                  onKeyPress={(event) => {
                    const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                    if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
                  ]}
                />
                <Pressable
                  onPress={submit}
                  disabled={busy || !!pending.length || !draft.trim()}
                  accessibilityLabel={t('Enviar mensaje', 'Send message')}
                  style={[
                    styles.send,
                    {
                      backgroundColor: theme.accentFill,
                      opacity: busy || pending.length || !draft.trim() ? 0.45 : 1,
                    },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                    {t('Enviar', 'Send')}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function HeaderButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.headerButton, { borderColor: theme.border, opacity: disabled ? 0.45 : 1 }]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

function Welcome({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.welcome}>
      <ThemedText>
        {t(
          'Hola, soy tu asistente. No solo respondo: puedo revisar tu biblioteca y el Tablón, analizarlos, cargar juegos, armar publicaciones, gestionar solicitudes e invitaciones y escribir a otros jugadores.',
          'Hi, I am your assistant. I do more than answer: I can review your library and the board, analyse them, load games, draft posts, manage requests and invitations and message other players.',
        )}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t(
          'Antes de publicar, borrar, invitar o escribir a otras personas te pido confirmación. Todo lo que hago queda en el historial.',
          'Before posting, deleting, inviting or messaging others I ask for your confirmation. Everything I do is kept in the history.',
        )}
      </ThemedText>
      <ThemedText type="smallBold">{t('Prueba con:', 'Try:')}</ThemedText>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion}
          disabled={disabled}
          onPress={() => onPick(suggestion)}
          style={[styles.suggestion, { borderColor: theme.controlBorder, backgroundColor: theme.accentSoft }]}>
          <ThemedText type="small">{suggestion}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function Item({ item }: { item: ChatItem }) {
  const theme = useTheme();
  const t = useT();

  if (item.kind === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={[styles.bubble, { backgroundColor: theme.accentFill }]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            {t('Tú', 'You')}
          </ThemedText>
          <ThemedText style={{ color: theme.onAccent }} selectable>
            {item.text}
          </ThemedText>
        </View>
      </View>
    );
  }
  if (item.kind === 'assistant') {
    return (
      <View style={styles.assistantRow}>
        <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="accent">
            ✦ {t('Asistente', 'Assistant')}
          </ThemedText>
          <ThemedText selectable>{item.text}</ThemedText>
        </View>
      </View>
    );
  }
  if (item.kind === 'error') return <StatusMessage kind="error">{item.text}</StatusMessage>;
  return <ActionLine action={item.action} />;
}

function ActionLine({ action }: { action: AssistantAction }) {
  const theme = useTheme();
  const t = useT();
  const isRead = action.risk === 'read' && action.status === 'ok';

  const tone =
    action.status === 'error' ? theme.danger : action.status === 'rejected' ? theme.warning : isRead ? theme.textSecondary : theme.success;
  const icon = action.status === 'error' ? '!' : action.status === 'rejected' ? '–' : isRead ? '⌕' : '✓';
  const label =
    action.status === 'error'
      ? t('No se pudo', 'Failed')
      : action.status === 'rejected'
        ? t('Rechazaste', 'You rejected')
        : isRead
          ? t('Consulté', 'Looked up')
          : t('Hecho', 'Done');

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${action.summary}${action.error ? `. ${action.error}` : ''}`}
      style={[styles.actionLine, { borderLeftColor: tone }]}>
      <ThemedText type="smallBold" style={{ color: tone }}>
        {icon} {label}
      </ThemedText>
      <ThemedText type="small" themeColor={isRead ? 'textSecondary' : 'text'}>
        {action.summary}
      </ThemedText>
      {action.error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {action.error}
        </ThemedText>
      ) : null}
    </View>
  );
}

function PendingCards({ pending }: { pending: PendingAction[] }) {
  const { decisions, decide, busy } = useAssistant();
  const theme = useTheme();
  const t = useT();

  return (
    <View style={styles.pendingBlock}>
      {pending.map((action) => {
        const decision = decisions[action.id];
        return (
          <View
            key={action.id}
            style={[styles.pendingCard, { borderColor: theme.warning, backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" style={{ color: theme.warning }}>
              ! {t('Necesito tu confirmación', 'I need your confirmation')}
            </ThemedText>
            <ThemedText>{action.summary}</ThemedText>
            <View style={styles.row}>
              <Pressable
                disabled={busy}
                onPress={() => decide(action.id, 'approve')}
                accessibilityLabel={`${t('Aprobar', 'Approve')}: ${action.summary}`}
                accessibilityState={{ selected: decision === 'approve' }}
                style={[styles.primaryButton, { backgroundColor: theme.accentFill }]}>
                <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                  {decision === 'approve' ? '✓ ' : ''}
                  {t('Aprobar', 'Approve')}
                </ThemedText>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => decide(action.id, 'reject')}
                accessibilityLabel={`${t('Rechazar', 'Reject')}: ${action.summary}`}
                accessibilityState={{ selected: decision === 'reject' }}
                style={[styles.secondaryButton, { borderColor: theme.border }]}>
                <ThemedText type="smallBold">
                  {decision === 'reject' ? '✓ ' : ''}
                  {t('Rechazar', 'Reject')}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

type HistoryRow = {
  id: string;
  tool: string;
  summary: string;
  status: 'ok' | 'error' | 'rejected';
  error: string | null;
  created_at: string;
};

function ActionHistory() {
  const theme = useTheme();
  const t = useT();
  const { language } = useLanguage();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('assistant_actions')
      .select('id, tool, summary, status, error, created_at')
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setFailed(true);
          setRows([]);
        } else {
          setRows((data ?? []) as HistoryRow[]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.list}>
      <ThemedText type="smallBold">{t('Acciones que hice en tu cuenta', 'Actions I took on your account')}</ThemedText>
      {rows === null ? <ActivityIndicator accessibilityLabel={t('Cargando', 'Loading')} /> : null}
      {failed ? (
        <StatusMessage kind="error">
          {t(
            'No se pudo cargar el historial. ¿Ejecutaste la migración del asistente en Supabase?',
            'Could not load the history. Did you run the assistant migration in Supabase?',
          )}
        </StatusMessage>
      ) : null}
      {rows && !rows.length && !failed ? (
        <ThemedText themeColor="textSecondary">
          {t('Todavía no hice ninguna acción. Pídeme algo y aparecerá aquí.', 'I have not done anything yet. Ask me something and it will show up here.')}
        </ThemedText>
      ) : null}
      {rows?.map((row) => {
        const tone = row.status === 'ok' ? theme.success : row.status === 'error' ? theme.danger : theme.warning;
        const label =
          row.status === 'ok' ? t('Hecho', 'Done') : row.status === 'error' ? t('Error', 'Error') : t('Rechazada', 'Rejected');
        const when = new Date(row.created_at).toLocaleString(language === 'en' ? 'en-US' : 'es-AR', {
          dateStyle: 'short',
          timeStyle: 'short',
        });
        return (
          <View key={row.id} accessible style={[styles.actionLine, { borderLeftColor: tone }]}>
            <ThemedText type="smallBold" style={{ color: tone }}>
              {label} · {when}
            </ThemedText>
            <ThemedText type="small">{row.summary}</ThemedText>
            {row.error ? (
              <ThemedText type="small" themeColor="textSecondary">
                {row.error}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 900,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabIcon: { lineHeight: 30, fontSize: 26 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 950 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  panelFull: { alignSelf: 'stretch' },
  panelWide: { width: PANEL_WIDTH, alignSelf: 'flex-end', borderLeftWidth: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  headerTitle: { flex: 1, minWidth: 160, gap: 2 },
  title: { fontSize: 22, lineHeight: 28 },
  headerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settings: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  settingsText: { flex: 1, minWidth: 160 },
  list: { padding: Spacing.three, gap: Spacing.three },
  welcome: { gap: Spacing.two },
  suggestion: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    justifyContent: 'center',
  },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '92%', borderRadius: 14, padding: Spacing.three, gap: 4 },
  assistantBubble: { borderWidth: 1 },
  actionLine: { borderLeftWidth: 4, paddingLeft: Spacing.two, gap: 2 },
  working: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pendingBlock: { gap: Spacing.two },
  pendingCard: { borderWidth: 1, borderLeftWidth: 5, borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  send: {
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
