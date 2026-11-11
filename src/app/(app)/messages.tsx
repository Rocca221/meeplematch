import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusMessage } from '@/components/status-message';
import { Pressable } from '@/components/accessible-pressable';
import { CloudImage } from '@/components/cloud-image';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { PageBanner } from '@/components/page-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloudImages } from '@/constants/cloud-images';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { gameCoverUrl } from '@/lib/game-cover';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

type Invitation = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  avatar_url: string | null;
};

type PlayerPreview = Player & {
  bio: string;
  experience_level: 'beginner' | 'casual' | 'experienced' | 'expert';
  preferred_game_types: string[];
};

type PlayerPreviewGame = {
  game_id: string;
  name: string;
  description: string | null;
  cover_path: string | null;
  status: UserGameStatus;
};

type UserGameStatus = 'owned' | 'played' | 'wishlist';

type PlayerPreviewResponse = {
  profile: PlayerPreview;
  games: PlayerPreviewGame[];
};

type Conversation = {
  id: string;
  invitation_id: string;
  created_at: string;
};

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type SendMessageResponse = {
  message: ChatMessage;
  notificationError?: string;
};

export default function MessagesScreen() {
  const { session } = useAuth();
  const { translate } = useLanguage();
  const userId = session?.user.id;
  const theme = useTheme();
  const topInset = useTopInset();
  const accent = theme.accent;
  const border = theme.border;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWide = windowWidth >= 900;
  const chatHeight = Math.max(520, windowHeight - topInset - 220);
  const [incoming, setIncoming] = useState<Invitation[]>([]);
  const [outgoing, setOutgoing] = useState<Invitation[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeSection, setActiveSection] = useState<
    'players' | 'connections' | 'chat'
  >('players');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerPreview, setPlayerPreview] = useState<PlayerPreviewResponse | null>(
    null,
  );
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [playerPreviewError, setPlayerPreviewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [activeInvitation, setActiveInvitation] = useState<Invitation | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageListRef = useRef<ScrollViewInstance>(null);
  const [draft, setDraft] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState('');
  const [error, setError] = useState('');

  const loadInvitations = useCallback(async () => {
    if (!userId) return;
    setError('');

    const [incomingResult, outgoingResult] = await Promise.all([
      supabase
        .from('invitations')
        .select('id, sender_id, receiver_id, status, created_at')
        .eq('receiver_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invitations')
        .select('id, sender_id, receiver_id, status, created_at')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    if (incomingResult.error) {
      setError(incomingResult.error.message);
      return;
    }
    if (outgoingResult.error) {
      setError(outgoingResult.error.message);
      return;
    }

    const incomingRows = (incomingResult.data ?? []) as Invitation[];
    const outgoingRows = (outgoingResult.data ?? []) as Invitation[];
    setIncoming(incomingRows);
    setOutgoing(outgoingRows);

    const playerIds = [
      ...new Set(
        [...incomingRows, ...outgoingRows].flatMap((invitation) =>
          invitation.sender_id === userId
            ? [invitation.receiver_id]
            : [invitation.sender_id],
        ),
      ),
    ];

    if (!playerIds.length) {
      setPlayers({});
      return;
    }

    const { data, error: playersError } = await supabase
      .from('profiles')
      .select('id, display_name, city, avatar_url')
      .in('id', playerIds);

    if (playersError) {
      setError(playersError.message);
      return;
    }
    setPlayers(
      Object.fromEntries(
        ((data ?? []) as Player[]).map((player) => [player.id, player]),
      ),
    );
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      setLoading(true);
      await loadInvitations();
      if (active) setLoading(false);
    }

    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadInvitations]);

  async function respondToInvitation(
    invitation: Invitation,
    status: 'accepted' | 'declined',
  ) {
    setActionId(invitation.id);
    setError('');
    const { error: responseError } = await supabase
      .from('invitations')
      .update({ status })
      .eq('id', invitation.id)
      .eq('receiver_id', userId);

    if (responseError) {
      setError(responseError.message);
    } else {
      await loadInvitations();
    }
    setActionId('');
  }

  async function searchPlayers() {
    const term = searchTerm.trim();
    if (!userId || term.length < 2) {
      setSearchResults([]);
      setError(term ? 'Escribe al menos 2 caracteres para buscar.' : '');
      return;
    }

    setSearching(true);
    setError('');
    const { data, error: searchError } = await supabase
      .from('profiles')
      .select('id, display_name, city, avatar_url')
      .ilike('display_name', `%${term}%`)
      .neq('id', userId)
      .order('display_name')
      .limit(10);

    if (searchError) {
      setError(searchError.message);
      setSearchResults([]);
    } else {
      const existingConnections = new Set(
        [...incoming, ...outgoing]
          .filter(
            (invitation) =>
              invitation.status === 'pending' ||
              invitation.status === 'accepted',
          )
          .map((invitation) =>
            invitation.sender_id === userId
              ? invitation.receiver_id
              : invitation.sender_id,
          ),
      );
      setSearchResults(
        ((data ?? []) as Player[]).filter(
          (player) => !existingConnections.has(player.id),
        ),
      );
    }
    setSearching(false);
  }

  async function sendInvitation(player: Player) {
    if (!userId) return;
    setActionId(player.id);
    setError('');
    const { error: invitationError } = await supabase.from('invitations').insert({
      sender_id: userId,
      receiver_id: player.id,
    });

    if (invitationError) {
      setError(invitationError.message);
    } else {
      setSearchResults((current) =>
        current.filter((result) => result.id !== player.id),
      );
      await loadInvitations();
      setSelectedPlayer(null);
      setPlayerPreview(null);
      setActiveSection('connections');
    }
    setActionId('');
  }

  async function openChat(invitation: Invitation) {
    if (
      invitation.status !== 'accepted' ||
      !userId ||
      (invitation.sender_id !== userId && invitation.receiver_id !== userId)
    ) {
      setError('El chat solo se habilita a los participantes tras aceptar la invitación.');
      return;
    }

    setLoadingChat(true);
    setError('');
    setActiveInvitation(invitation);

    try {
      let { data: existing, error: conversationError } = await supabase
        .from('conversations')
        .select('id, invitation_id, created_at')
        .eq('invitation_id', invitation.id)
        .maybeSingle();

      if (conversationError) throw conversationError;

      if (!existing) {
        const created = await supabase
          .from('conversations')
          .insert({ invitation_id: invitation.id })
          .select('id, invitation_id, created_at')
          .single();

        if (created.error?.code === '23505') {
          const retry = await supabase
            .from('conversations')
            .select('id, invitation_id, created_at')
            .eq('invitation_id', invitation.id)
            .single();
          if (retry.error) throw retry.error;
          existing = retry.data;
        } else if (created.error) {
          throw created.error;
        } else {
          existing = created.data;
        }
      }

      if (!existing) throw new Error('No se pudo abrir la conversación.');

      const conversationRow = existing as Conversation;
      const { data: memberRows, error: membersError } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationRow.id);
      if (membersError) throw membersError;

      const existingMembers = new Set(
        ((memberRows ?? []) as { user_id: string }[]).map((member) => member.user_id),
      );
      const participantIds = [invitation.sender_id, invitation.receiver_id];
      const missingMembers = participantIds
        .filter((participantId) => !existingMembers.has(participantId))
        .map((participantId) => ({
          conversation_id: conversationRow.id,
          user_id: participantId,
        }));

      if (missingMembers.length) {
        const { error: memberInsertError } = await supabase
          .from('conversation_members')
          .insert(missingMembers);
        if (memberInsertError) throw memberInsertError;
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at, read_at')
        .eq('conversation_id', conversationRow.id)
        .order('created_at', { ascending: true })
        .limit(100);
      if (messagesError) throw messagesError;

      const readAt = new Date().toISOString();
      const { error: markReadError } = await supabase
        .from('messages')
        .update({ read_at: readAt })
        .eq('conversation_id', conversationRow.id)
        .neq('sender_id', userId)
        .is('read_at', null);
      if (markReadError) throw markReadError;

      setConversation(conversationRow);
      setMessages(
        ((messageRows ?? []) as ChatMessage[]).map((message) =>
          message.sender_id !== userId && !message.read_at
            ? { ...message, read_at: readAt }
            : message,
        ),
      );
      setActiveSection('chat');
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : 'No se pudo abrir el chat.',
      );
      setActiveInvitation(null);
      setConversation(null);
    } finally {
      setLoadingChat(false);
    }
  }

  async function openPlayerPreview(player: Player) {
    setSelectedPlayer(player);
    setPlayerPreview(null);
    setPlayerPreviewError('');
    setLoadingPreview(true);

    const { data, error: previewError } = await supabase.rpc(
      'get_player_preview',
      { target_user_id: player.id },
    );
    if (previewError) {
      setPlayerPreviewError(previewError.message);
    } else if (data?.profile) {
      setPlayerPreview(data as PlayerPreviewResponse);
    } else {
      setPlayerPreviewError('No se pudo cargar el perfil de este jugador.');
    }
    setLoadingPreview(false);
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !userId || !conversation) return;

    setSending(true);
    setError('');
    setSendNotice('');
    try {
      const { data, error: sendError } =
        await supabase.functions.invoke<SendMessageResponse>('send-message', {
          body: { conversationId: conversation.id, body },
        });

      if (sendError) {
        setError(sendError.message);
      } else if (!data) {
        setError('El servidor no devolvió el resultado del envío.');
      } else {
        // El canal en tiempo real puede entregar este mismo mensaje antes que la
        // respuesta de la función: no duplicarlo (claves repetidas en la lista).
        setMessages((current) =>
          current.some((message) => message.id === data.message.id)
            ? current
            : [...current, data.message],
        );
        setDraft('');
        if (data.notificationError) {
          setSendNotice(
            `${data.notificationError} Puedes seguir usando el chat; el mensaje quedó guardado.`,
          );
        }
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'No se pudo enviar el mensaje.',
      );
    } finally {
      setSending(false);
    }
  }

  const chatVisible = Boolean(conversation) && (isWide || activeSection === 'chat');

  useEffect(() => {
    if (!conversation?.id || !userId || !chatVisible) return;

    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((current) => {
            if (current.some((message) => message.id === incoming.id)) {
              return current;
            }
            return [...current, incoming].sort(
              (left, right) =>
                new Date(left.created_at).getTime() -
                new Date(right.created_at).getTime(),
            );
          });

          if (incoming.sender_id !== userId) {
            void (async () => {
              const { error: readError } = await supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', incoming.id)
                .eq('conversation_id', conversation.id)
                .is('read_at', null);
              if (readError) {
                setError(
                  `No se pudo marcar el mensaje como leído: ${readError.message}`,
                );
              }
            })();
          }
        },
      )
      .subscribe((status, subscriptionError) => {
        if (status === 'SUBSCRIBED') {
          void (async () => {
            const { data, error: syncError } = await supabase
              .from('messages')
              .select('id, conversation_id, sender_id, body, created_at, read_at')
              .eq('conversation_id', conversation.id)
              .order('created_at', { ascending: true })
              .limit(100);
            if (syncError) {
              setError(`No se pudo sincronizar el chat: ${syncError.message}`);
              return;
            }

            setMessages((current) => {
              const byId = new Map(
                current.map((message) => [message.id, message]),
              );
              for (const message of (data ?? []) as ChatMessage[]) {
                byId.set(message.id, message);
              }
              return [...byId.values()].sort(
                (left, right) =>
                  new Date(left.created_at).getTime() -
                  new Date(right.created_at).getTime(),
              );
            });
          })();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(
            subscriptionError?.message ??
              'No se pudo conectar al chat en tiempo real.',
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatVisible, conversation?.id, userId]);

  const activePlayerId = activeInvitation
    ? activeInvitation.sender_id === userId
      ? activeInvitation.receiver_id
      : activeInvitation.sender_id
    : null;
  const activePlayer = activePlayerId ? players[activePlayerId] : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingTop: Spacing.five + topInset }]}>
          <PageBanner
            image={CloudImages.messages}
            kicker="CONEXIONES DE CONFIANZA"
            title="Mensajes"
            subtitle="El chat privado se habilita cuando ambas personas aceptan."
          />

          {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}

          <View style={[styles.split, isWide && styles.splitWide]}>
          <View style={isWide ? styles.leftPane : styles.pane}>
          <View style={styles.sectionNavigation}>
            <SectionTab
              active={activeSection === 'players'}
              label="Buscar jugadores"
              onPress={() => setActiveSection('players')}
              accent={accent}
              border={border}
              textColor={theme.text}
            />
            <SectionTab
              active={activeSection === 'connections' || (isWide && activeSection === 'chat')}
              label={`Solicitudes (${incoming.filter((item) => item.status === 'pending').length})`}
              onPress={() => setActiveSection('connections')}
              accent={accent}
              border={border}
              textColor={theme.text}
            />
            {activeInvitation && conversation && !isWide ? (
              <SectionTab
                active={activeSection === 'chat'}
                label="Chat abierto"
                onPress={() => setActiveSection('chat')}
                accent={accent}
                border={border}
                textColor={theme.text}
              />
            ) : null}
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
              <ThemedText themeColor="textSecondary">
                Cargando invitaciones...
              </ThemedText>
            </View>
          ) : (
            <>
              {activeSection === 'players' ? (
              <Section title="Buscar jugadores" count={searchResults.length}>
                <View style={styles.playerSearch}>
                  <LocalizedTextInput
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    onSubmitEditing={() => void searchPlayers()}
                    placeholder="Nombre de jugador"
                    placeholderTextColor="#858995"
                    returnKeyType="search"
                    style={[
                      styles.searchInput,
                      { color: theme.text, borderColor: border },
                    ]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={searching}
                    onPress={() => void searchPlayers()}
                    style={[styles.searchButton, { backgroundColor: theme.accentFill }]}>
                    <ThemedText style={styles.acceptText}>
                      {searching ? '...' : 'Buscar'}
                    </ThemedText>
                  </Pressable>
                </View>
                {searchResults.map((player) => (
                  <Pressable
                    key={player.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver perfil detallado de ${player.display_name}`}
                    accessibilityHint="Abre su perfil, preferencias y biblioteca de juegos."
                    onPress={() => void openPlayerPreview(player)}>
                  <ThemedView type="backgroundElement" style={styles.invitationCard}>
                    <PlayerAvatar player={player} accent={theme.accentFill} />
                    <View style={styles.invitationCopy}>
                      <ThemedText type="smallBold">
                        {player.display_name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {player.city || 'Jugador MeepleMatch'}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={{ color: accent }}>
                      Ver perfil
                    </ThemedText>
                  </ThemedView>
                  </Pressable>
                ))}
                {searchTerm.trim().length >= 2 &&
                !searching &&
                searchResults.length === 0 ? (
                  <ThemedText themeColor="textSecondary">
                    No se encontraron jugadores nuevos con ese nombre.
                  </ThemedText>
                ) : null}
              </Section>
              ) : null}

              {activeSection === 'connections' || (isWide && activeSection === 'chat') ? (
              <>
              <Section
                title="Solicitudes recibidas"
                count={incoming.filter((invitation) => invitation.status === 'pending').length}>
                {incoming.length ? (
                  incoming.map((invitation) => (
                    <InvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      player={
                        players[invitation.sender_id] ?? {
                          id: invitation.sender_id,
                          display_name: 'Jugador MeepleMatch',
                          city: null,
                          avatar_url: null,
                        }
                      }
                      incoming
                      actionId={actionId}
                      accent={theme.accentFill}
                      onRespond={(status) =>
                        void respondToInvitation(invitation, status)
                      }
                      onOpenChat={() => void openChat(invitation)}
                    />
                  ))
                ) : (
                  <ThemedText themeColor="textSecondary">
                    Cuando alguien quiera conectar contigo, verás su solicitud aquí.
                  </ThemedText>
                )}
              </Section>

              <Section title="Solicitudes enviadas" count={outgoing.length}>
                {outgoing.length ? (
                  outgoing.map((invitation) => (
                    <InvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      player={
                        players[invitation.receiver_id] ?? {
                          id: invitation.receiver_id,
                          display_name: 'Jugador MeepleMatch',
                          city: null,
                          avatar_url: null,
                        }
                      }
                      incoming={false}
                      actionId={actionId}
                      accent={theme.accentFill}
                      onRespond={() => undefined}
                      onOpenChat={() => void openChat(invitation)}
                    />
                  ))
                ) : (
                  <ThemedText themeColor="textSecondary">
                    Las invitaciones que envíes aparecerán aquí.
                  </ThemedText>
                )}
              </Section>
              </>
              ) : null}
            </>
          )}
          </View>
          <View style={isWide ? styles.rightPane : undefined}>
          {chatVisible && activeInvitation && conversation ? (
            <ThemedView
              type="backgroundElement"
              style={[
                styles.chatCard,
                isWide && { height: chatHeight, minHeight: 0 },
                { borderColor: border },
              ]}>
              <View style={styles.chatHeader}>
                <View style={styles.chatHeaderCopy}>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    {activePlayer?.display_name ?? 'Conversación'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Invitación aceptada · chat privado
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setActiveInvitation(null);
                    setConversation(null);
                    setMessages([]);
                    setError('');
                    setActiveSection('connections');
                  }}>
                  <ThemedText type="smallBold" style={{ color: accent }}>
                    Cerrar
                  </ThemedText>
                </Pressable>
              </View>

              <ScrollView
                ref={messageListRef}
                keyboardShouldPersistTaps="handled"
                style={[styles.messageList, isWide && styles.messageListWide]}
                contentContainerStyle={styles.messageListContent}
                accessibilityLiveRegion="polite"
                onContentSizeChange={() =>
                  messageListRef.current?.scrollToEnd({ animated: true })
                }
                nestedScrollEnabled>
                {messages.length ? (
                  messages.map((message) => {
                    const own = message.sender_id === userId;
                    return (
                      <View
                        key={message.id}
                        style={[
                          styles.messageBubble,
                          own
                            ? [styles.ownMessage, { backgroundColor: theme.accentFill }]
                            : [styles.otherMessage, { borderColor: border }],
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={own ? styles.ownMessageTime : styles.otherMessageTime}>
                          {own ? 'Tú' : activePlayer?.display_name ?? 'Jugador'}
                        </ThemedText>
                        <ThemedText style={own ? styles.ownMessageText : undefined}>
                          {message.body}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          style={own ? styles.ownMessageTime : styles.otherMessageTime}>
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </ThemedText>
                      </View>
                    );
                  })
                ) : (
                  <ThemedText themeColor="textSecondary">
                    Saluda y empieza a planear la próxima partida.
                  </ThemedText>
                )}
              </ScrollView>

              <View style={styles.composer}>
                <LocalizedTextInput
                  accessibilityLabel="Escribe un mensaje"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Escribe un mensaje..."
                  placeholderTextColor="#858995"
                  maxLength={4000}
                  multiline
                  style={[
                    styles.messageInput,
                    { color: theme.text, borderColor: border },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={sending || !draft.trim()}
                  onPress={() => void sendMessage()}
                  style={({ pressed }) => [
                    styles.sendButton,
                    { backgroundColor: theme.accentFill },
                    (pressed || sending || !draft.trim()) && styles.disabled,
                  ]}>
                  <ThemedText style={styles.sendButtonText}>
                    {sending ? '...' : 'Enviar'}
                  </ThemedText>
                </Pressable>
              </View>
              {sendNotice ? (
                <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                  {sendNotice}
                </ThemedText>
              ) : null}
            </ThemedView>
          ) : null}
          {chatVisible && activeInvitation && loadingChat ? (
            <View style={styles.loading}>
              <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
              <ThemedText themeColor="textSecondary">
                Abriendo conversación...
              </ThemedText>
            </View>
          ) : null}

          {isWide && !(activeInvitation && conversation) && !loadingChat ? (
            <ThemedView
              type="backgroundElement"
              style={[styles.chatPlaceholder, { borderColor: border, minHeight: chatHeight }]}>
              <CloudImage uri={CloudImages.chat} style={styles.chatPlaceholderImage} />
              <View style={styles.chatPlaceholderCopy}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Elige una conversación
                </ThemedText>
                <ThemedText themeColor="textSecondary">
                  Acepta una solicitud o abre un chat desde la lista para empezar a
                  planear la próxima partida.
                </ThemedText>
              </View>
            </ThemedView>
          ) : null}
          </View>
          </View>
        </ScrollView>
        <Modal
          animationType="slide"
          onRequestClose={() => {
            setSelectedPlayer(null);
            setPlayerPreview(null);
          }}
          transparent
          visible={selectedPlayer !== null}>
          <View style={styles.modalBackdrop}>
            <ThemedView type="backgroundElement" style={styles.previewModal}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.previewContent}>
                <View style={styles.chatHeader}>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>
                    Perfil de jugador
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedPlayer(null);
                      setPlayerPreview(null);
                    }}>
                    <ThemedText type="smallBold" style={{ color: accent }}>
                      Cerrar
                    </ThemedText>
                  </Pressable>
                </View>

                {loadingPreview ? (
                  <View style={styles.loading}>
                    <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
                    <ThemedText themeColor="textSecondary">
                      Cargando perfil y biblioteca...
                    </ThemedText>
                  </View>
                ) : playerPreviewError ? (
                  <StatusMessage kind="error">{playerPreviewError}</StatusMessage>
                ) : playerPreview ? (
                  <>
                    <View style={styles.previewIdentity}>
                      <PlayerAvatar
                        player={playerPreview.profile}
                        accent={theme.accentFill}
                        large
                      />
                      <View style={styles.invitationCopy}>
                        <ThemedText type="subtitle">
                          {playerPreview.profile.display_name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {playerPreview.profile.city || 'Ubicación no indicada'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {experienceLabel(
                            playerPreview.profile.experience_level,
                          )}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText themeColor="textSecondary">
                      {playerPreview.profile.bio || 'Este jugador todavía no agregó una presentación.'}
                    </ThemedText>
                    <View style={styles.previewSection}>
                      <ThemedText type="smallBold">Gustos de juego</ThemedText>
                      {playerPreview.profile.preferred_game_types.length ? (
                        <ThemedText themeColor="textSecondary">
                          {playerPreview.profile.preferred_game_types
                            .map(translate)
                            .join(', ')}
                        </ThemedText>
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary">
                          Aún no indicó preferencias.
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.previewSection}>
                      <ThemedText type="smallBold">
                        Biblioteca lúdica ({playerPreview.games.length})
                      </ThemedText>
                      {!playerPreview.games.length ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          Todavía no agregó juegos a su biblioteca.
                        </ThemedText>
                      ) : (
                        (['owned', 'played', 'wishlist'] as const).map((status) => {
                          const games = playerPreview.games.filter(
                            (game) => game.status === status,
                          );
                          return (
                            <View key={status} style={styles.previewGameGroup}>
                              <ThemedText type="smallBold" themeColor="textSecondary">
                                {playerGameStatusLabel(status)} ({games.length})
                              </ThemedText>
                              {games.length ? (
                                games.map((game) => (
                                  <View key={game.game_id} style={styles.previewGame}>
                                    <PlayerGameCover game={game} />
                                    <View style={styles.invitationCopy}>
                                      <ThemedText type="smallBold">
                                        {game.name}
                                      </ThemedText>
                                      {game.description ? (
                                        <ThemedText
                                          type="small"
                                          themeColor="textSecondary"
                                          numberOfLines={3}>
                                          {game.description}
                                        </ThemedText>
                                      ) : null}
                                    </View>
                                  </View>
                                ))
                              ) : (
                                <ThemedText type="small" themeColor="textSecondary">
                                  No indicó juegos en esta categoría.
                                </ThemedText>
                              )}
                            </View>
                          );
                        })
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={actionId === playerPreview.profile.id}
                      onPress={() =>
                        void sendInvitation(playerPreview.profile)
                      }
                      style={[
                        styles.searchButton,
                        { backgroundColor: theme.accentFill },
                        actionId === playerPreview.profile.id && styles.disabled,
                      ]}>
                      <ThemedText style={styles.acceptText}>
                        {actionId === playerPreview.profile.id
                          ? 'Enviando solicitud...'
                          : 'Enviar solicitud de amistad'}
                      </ThemedText>
                    </Pressable>
                  </>
                ) : null}
              </ScrollView>
            </ThemedView>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {title}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {count}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

function InvitationCard({
  invitation,
  player,
  incoming,
  actionId,
  accent,
  onRespond,
  onOpenChat,
}: {
  invitation: Invitation;
  player: Player;
  incoming: boolean;
  actionId: string;
  accent: string;
  onRespond: (status: 'accepted' | 'declined') => void;
  onOpenChat: () => void;
}) {
  const pending = invitation.status === 'pending';
  const accepted = invitation.status === 'accepted';

  return (
    <ThemedView type="backgroundElement" style={styles.invitationCard}>
      <PlayerAvatar player={player} accent={accent} />
      <View style={styles.invitationCopy}>
        <ThemedText type="smallBold">{player.display_name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {player.city || (accepted ? 'Conexión aceptada' : 'Solicitud de invitación')}
        </ThemedText>
      </View>

      {pending && incoming ? (
        <View style={styles.invitationActions}>
          <Pressable
            accessibilityRole="button"
            disabled={actionId === invitation.id}
            onPress={() => onRespond('accepted')}
            style={[styles.acceptButton, { backgroundColor: accent }]}>
            <ThemedText style={styles.acceptText}>
              {actionId === invitation.id ? '...' : 'Aceptar'}
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={actionId === invitation.id}
            onPress={() => onRespond('declined')}
            style={styles.declineButton}>
            <ThemedText type="small">Rechazar</ThemedText>
          </Pressable>
        </View>
      ) : accepted ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenChat}
          style={[styles.chatButton, { backgroundColor: accent }]}>
          <ThemedText style={styles.acceptText}>Abrir chat</ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {invitation.status === 'declined' ? 'No aceptada' : 'Pendiente'}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function SectionTab({
  active,
  label,
  onPress,
  accent,
  border,
  textColor,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  accent: string;
  border: string;
  textColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.sectionTab,
        {
          borderColor: active ? accent : border,
          backgroundColor: active ? `${accent}18` : 'transparent',
        },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {active ? (
          <ThemedText type="smallBold" style={{ color: accent }}>
            ✓
          </ThemedText>
        ) : null}
        <ThemedText
          type="smallBold"
          style={{ color: active ? accent : textColor }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function PlayerAvatar({
  player,
  accent,
  large = false,
}: {
  player: Player;
  accent: string;
  large?: boolean;
}) {
  return player.avatar_url ? (
    <Image
      source={{ uri: player.avatar_url }}
      contentFit="cover"
      style={[styles.avatar, large && styles.largeAvatar]}
      accessibilityLabel={`Foto de ${player.display_name}`}
    />
  ) : (
    <View
      style={[
        styles.avatar,
        large && styles.largeAvatar,
        { backgroundColor: accent },
      ]}>
      <ThemedText style={[styles.avatarText, large && styles.largeAvatarText]}>
        {player.display_name.slice(0, 1).toUpperCase()}
      </ThemedText>
    </View>
  );
}

function PlayerGameCover({ game }: { game: PlayerPreviewGame }) {
  const imageUrl = gameCoverUrl(game.cover_path);

  return (
    <View style={styles.previewGameCover}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          contentFit="cover"
          style={styles.previewGameImage}
          accessibilityLabel={`Portada de ${game.name}`}
        />
      ) : (
        <ThemedText>🎲</ThemedText>
      )}
    </View>
  );
}

function experienceLabel(
  level: PlayerPreview['experience_level'],
): string {
  const labels = {
    beginner: 'Está empezando',
    casual: 'Jugador casual',
    experienced: 'Con experiencia',
    expert: 'Experto/a',
  } satisfies Record<PlayerPreview['experience_level'], string>;
  return labels[level];
}

function playerGameStatusLabel(status: UserGameStatus) {
  if (status === 'played') return 'Ya lo jugó';
  if (status === 'wishlist') return 'Quiere jugarlo';
  return 'En su colección';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: 120,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionNavigation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  sectionTab: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  playerSearch: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  searchButton: {
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 29,
  },
  invitationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 16,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  largeAvatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
  },
  largeAvatarText: {
    fontSize: 28,
  },
  invitationCopy: {
    flex: 1,
    gap: 2,
  },
  invitationActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  acceptButton: {
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  declineButton: {
    minHeight: 38,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatButton: {
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  chatCard: {
    minHeight: 620,
    padding: Spacing.three,
    borderRadius: 10,
    borderWidth: 1,
    gap: Spacing.three,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chatHeaderCopy: {
    gap: Spacing.one,
  },
  split: {
    gap: Spacing.four,
  },
  splitWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pane: {
    gap: Spacing.four,
  },
  leftPane: {
    width: 400,
    flexShrink: 0,
    gap: Spacing.four,
  },
  rightPane: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.three,
  },
  messageListWide: {
    flex: 1,
    minHeight: 0,
    maxHeight: 4000,
  },
  chatPlaceholder: {
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  chatPlaceholderImage: {
    width: '100%',
    height: 220,
  },
  chatPlaceholderCopy: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  messageList: {
    minHeight: 420,
    maxHeight: 580,
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(125, 130, 145, 0.3)',
    borderRadius: 14,
  },
  messageListContent: {
    flexGrow: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  messageBubble: {
    maxWidth: '88%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    borderColor: 'transparent',
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  ownMessageTime: {
    alignSelf: 'flex-end',
    color: 'rgba(255,255,255,0.78)',
  },
  otherMessage: {
    alignSelf: 'flex-start',
  },
  otherMessageTime: {
    alignSelf: 'flex-end',
    opacity: 0.7,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  messageInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.65,
  },
  error: {
    color: '#C73535',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  previewModal: {
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
  },
  previewContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  previewIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  previewSection: {
    gap: Spacing.two,
  },
  previewGameGroup: {
    gap: Spacing.one,
  },
  previewGame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: 14,
  },
  previewGameCover: {
    width: 46,
    height: 56,
    borderRadius: 9,
    backgroundColor: 'rgba(100, 120, 160, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewGameImage: {
    width: '100%',
    height: '100%',
  },
});
