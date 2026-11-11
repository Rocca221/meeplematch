import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pressable } from '@/components/accessible-pressable';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { type AppNotification, useAppPanels } from '@/providers/app-panels-provider';

type Described = {
  title: string;
  detail: string;
  target: 'messages' | 'board' | null;
  query?: string;
};

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function describe(item: AppNotification, names: Record<string, string>): Described {
  const p = item.payload ?? {};
  switch (item.type) {
    case 'message': {
      const sender = names[text(p.sender_id, '')] ?? 'Alguien';
      return {
        title: `${sender} te escribió`,
        detail: 'Tienes un mensaje nuevo en tu chat.',
        target: 'messages',
      };
    }
    case 'invitation':
      return {
        title: `${text(p.sender_name, 'Un jugador')} quiere jugar contigo`,
        detail: 'Te envió una invitación. Respóndela desde Chat.',
        target: 'messages',
      };
    case 'invitation_response': {
      const who = text(p.receiver_name, 'Un jugador');
      return p.status === 'accepted'
        ? {
            title: `${who} aceptó tu invitación`,
            detail: 'Ya pueden chatear.',
            target: 'messages',
          }
        : {
            title: `${who} rechazó tu invitación`,
            detail: 'Puedes invitar a otras personas desde el Tablón.',
            target: null,
          };
    }
    case 'project_interest': {
      const title = text(p.project_title, 'tu anuncio');
      return {
        title: `${text(p.user_name, 'Alguien')} se interesó en «${title}»`,
        detail: 'Míralo en el Tablón e invítalo a jugar.',
        target: 'board',
        query: title,
      };
    }
    case 'moderation': {
      const title = text(p.project_title, 'tu anuncio');
      if (p.action === 'deleted') {
        return {
          title: `Un administrador eliminó «${title}»`,
          detail: 'No cumplía las normas de la comunidad.',
          target: null,
        };
      }
      if (p.action === 'hidden') {
        return {
          title: `Un administrador ocultó «${title}»`,
          detail: 'Ya no se muestra a los demás jugadores.',
          target: null,
        };
      }
      return {
        title: 'Tu cuenta fue reactivada',
        detail: 'Ya puedes volver a publicar e invitar.',
        target: null,
      };
    }
    default:
      return { title: 'Aviso nuevo', detail: '', target: null };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Bandeja de avisos: ventana a pantalla completa, igual que el resto de paneles. */
export function NotificationsPanel() {
  const theme = useTheme();
  const router = useRouter();
  const {
    inboxOpen,
    closeInbox,
    notifications,
    unreadCount,
    notificationsLoading,
    notificationsError,
    refreshNotifications,
    markRead,
    markAllRead,
    removeNotification,
    clearNotifications,
  } = useAppPanels();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (inboxOpen) void refreshNotifications();
  }, [inboxOpen, refreshNotifications]);

  // Los avisos de mensaje solo traen el id de quien escribió: se busca el nombre.
  useEffect(() => {
    if (!inboxOpen) return;
    const missing = [
      ...new Set(
        notifications
          .filter((item) => item.type === 'message')
          .map((item) => text(item.payload?.sender_id, ''))
          .filter((id) => id && !names[id]),
      ),
    ];
    if (!missing.length) return;
    let active = true;
    void supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', missing)
      .then(({ data }) => {
        if (!active || !data) return;
        setNames((current) => ({
          ...current,
          ...Object.fromEntries(
            (data as { id: string; display_name: string }[]).map((row) => [
              row.id,
              row.display_name,
            ]),
          ),
        }));
      });
    return () => {
      active = false;
    };
  }, [inboxOpen, notifications, names]);

  function openItem(item: AppNotification) {
    if (!item.read_at) void markRead(item.id);
    const described = describe(item, names);
    if (!described.target) return;
    closeInbox();
    if (described.target === 'messages') router.push('/messages');
    else router.push({ pathname: '/explore', params: { q: described.query ?? '' } });
  }

  return (
    <Modal animationType="slide" onRequestClose={closeInbox} visible={inboxOpen}>
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.screen}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.bar}>
              <View style={styles.barTitle}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  MEEPLEMATCH
                </ThemedText>
                <ThemedText type="title" style={styles.title}>
                  Avisos
                </ThemedText>
                <ThemedText themeColor="textSecondary">
                  {unreadCount
                    ? `${unreadCount} sin leer`
                    : notifications.length
                      ? 'Estás al día.'
                      : 'Todavía no tienes avisos.'}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar avisos"
                onPress={closeInbox}
                style={({ pressed }) => [
                  styles.button,
                  { borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">✕ Cerrar</ThemedText>
              </Pressable>
            </View>

            {notificationsError ? (
              <StatusMessage kind="error">{notificationsError}</StatusMessage>
            ) : null}

            {notifications.length ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!unreadCount}
                  onPress={() => void markAllRead()}
                  style={[styles.button, { borderColor: theme.border }, !unreadCount && styles.dim]}>
                  <ThemedText type="smallBold">Marcar todo como leído</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void clearNotifications()}
                  style={[styles.button, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">Vaciar bandeja</ThemedText>
                </Pressable>
              </View>
            ) : null}

            {notificationsLoading && !notifications.length ? (
              <ThemedText themeColor="textSecondary">Cargando avisos...</ThemedText>
            ) : null}

            {notifications.map((item) => {
              const described = describe(item, names);
              const unread = !item.read_at;
              return (
                <ThemedView
                  key={item.id}
                  type="backgroundElement"
                  style={[
                    styles.item,
                    { borderColor: unread ? theme.accent : theme.border },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${unread ? 'Sin leer. ' : ''}${described.title}`}
                    onPress={() => openItem(item)}
                    style={styles.itemMain}>
                    <View style={styles.itemHead}>
                      {unread ? (
                        <ThemedText type="smallBold" style={{ color: theme.accent }}>
                          ● NUEVO
                        </ThemedText>
                      ) : null}
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDate(item.created_at)}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold">{described.title}</ThemedText>
                    {described.detail ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {described.detail}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Borrar este aviso"
                    onPress={() => void removeNotification(item.id)}
                    style={styles.remove}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      Borrar
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  barTitle: { flex: 1, gap: Spacing.one },
  title: { fontSize: 32, lineHeight: 40 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  button: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  dim: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
  item: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  itemMain: { flex: 1, padding: Spacing.three, gap: Spacing.one },
  itemHead: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', flexWrap: 'wrap' },
  remove: { paddingHorizontal: Spacing.three, justifyContent: 'center' },
});
