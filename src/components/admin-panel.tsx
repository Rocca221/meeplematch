import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pressable } from '@/components/accessible-pressable';
import { Choice } from '@/components/choice';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useAppPanels } from '@/providers/app-panels-provider';
import { useAuth } from '@/providers/auth-provider';

type AdminUser = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  projects_count: number;
};

type AdminProject = {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  image_path: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  closed: 'Cerrado por su autor',
  archived: 'Oculto por moderación',
  draft: 'Borrador',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase();
}

/**
 * Panel de administración (solo se monta para administradores). La seguridad no
 * depende de esta pantalla: la base de datos rechaza estas operaciones a quien
 * no sea administrador.
 */
export function AdminPanel() {
  const theme = useTheme();
  const { session } = useAuth();
  const { adminOpen, closeAdmin } = useAppPanels();
  const [tab, setTab] = useState<'users' | 'posts'>('users');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [posts, setPosts] = useState<AdminProject[]>([]);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      if (tab === 'users') {
        const { data, error: rpcError } = await supabase.rpc('admin_list_users', {
          search: null,
          max_rows: 200,
        });
        if (rpcError) throw rpcError;
        setUsers((data ?? []) as AdminUser[]);
      } else {
        const { data, error: postsError } = await supabase
          .from('projects')
          .select('id, owner_id, title, status, expires_at, created_at, image_path')
          .order('created_at', { ascending: false })
          .limit(200);
        if (postsError) throw postsError;
        const rows = (data ?? []) as AdminProject[];
        setPosts(rows);

        const ownerIds = [...new Set(rows.map((row) => row.owner_id))];
        if (ownerIds.length) {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', ownerIds);
          if (profilesError) throw profilesError;
          setOwners(
            Object.fromEntries(
              ((profiles ?? []) as { id: string; display_name: string }[]).map((row) => [
                row.id,
                row.display_name,
              ]),
            ),
          );
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la lista.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!adminOpen) return;
    void load();
  }, [adminOpen, load]);

  const filteredUsers = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return users;
    return users.filter((user) =>
      normalize(`${user.display_name} ${user.email}`).includes(needle),
    );
  }, [users, query]);

  const filteredPosts = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return posts;
    return posts.filter((post) =>
      normalize(`${post.title} ${owners[post.owner_id] ?? ''}`).includes(needle),
    );
  }, [posts, owners, query]);

  async function toggleSuspension(user: AdminUser) {
    const suspend = !user.suspended_at;
    const confirmed = await confirmAction(
      suspend ? 'Suspender usuario' : 'Reactivar usuario',
      suspend
        ? `${user.display_name} no podrá publicar, mostrar interés ni invitar. Podrás reactivarlo cuando quieras.`
        : `${user.display_name} podrá volver a usar la comunidad con normalidad.`,
      suspend ? 'Suspender' : 'Reactivar',
    );
    if (!confirmed) return;

    setBusy(`user:${user.id}`);
    setError('');
    const { error: rpcError } = await supabase.rpc('admin_set_user_suspended', {
      target_user_id: user.id,
      suspend,
      suspend_reason: null,
    });
    if (rpcError) setError(rpcError.message);
    else await load();
    setBusy('');
  }

  async function setPostStatus(post: AdminProject, status: 'open' | 'archived') {
    setBusy(`post:${post.id}`);
    setError('');
    const { error: updateError } = await supabase
      .from('projects')
      .update({ status })
      .eq('id', post.id);
    if (updateError) setError(updateError.message);
    else await load();
    setBusy('');
  }

  async function deletePost(post: AdminProject) {
    const confirmed = await confirmAction(
      'Eliminar anuncio',
      `Se eliminará «${post.title}» definitivamente y su autor recibirá un aviso. Esta acción no se puede deshacer.`,
      'Eliminar',
    );
    if (!confirmed) return;

    setBusy(`post:${post.id}`);
    setError('');
    const { error: deleteError } = await supabase.from('projects').delete().eq('id', post.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (post.image_path) {
        await supabase.storage.from('project-images').remove([post.image_path]);
      }
      await load();
    }
    setBusy('');
  }

  return (
    <Modal animationType="slide" onRequestClose={closeAdmin} visible={adminOpen}>
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.screen}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.bar}>
              <View style={styles.barTitle}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ADMINISTRACIÓN
                </ThemedText>
                <ThemedText type="title" style={styles.title}>
                  Moderación
                </ThemedText>
                <ThemedText themeColor="textSecondary">
                  Gestiona usuarios y anuncios de la comunidad.
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar panel de administración"
                onPress={closeAdmin}
                style={({ pressed }) => [
                  styles.button,
                  { borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold">✕ Cerrar</ThemedText>
              </Pressable>
            </View>

            <View style={styles.row} accessibilityRole="radiogroup">
              <Choice
                label="Usuarios"
                selected={tab === 'users'}
                onPress={() => {
                  setLoading(true);
                  setTab('users');
                  setQuery('');
                }}
              />
              <Choice
                label="Anuncios"
                selected={tab === 'posts'}
                onPress={() => {
                  setLoading(true);
                  setTab('posts');
                  setQuery('');
                }}
              />
            </View>

            <LocalizedTextInput
              accessibilityLabel={tab === 'users' ? 'Buscar usuarios' : 'Buscar anuncios'}
              value={query}
              onChangeText={setQuery}
              placeholder={
                tab === 'users' ? 'Buscar por nombre o correo' : 'Buscar por título o autor'
              }
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            />

            {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
            {loading ? <ThemedText themeColor="textSecondary">Cargando...</ThemedText> : null}

            {tab === 'users'
              ? filteredUsers.map((user) => {
                  const isSelf = user.id === session?.user.id;
                  const isAdmin = user.role === 'admin';
                  return (
                    <ThemedView
                      key={user.id}
                      type="backgroundElement"
                      style={[styles.item, { borderColor: theme.border }]}>
                      <View style={styles.itemCopy}>
                        <ThemedText type="smallBold">
                          {user.display_name}
                          {isSelf ? ' (tú)' : ''}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {user.email}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {isAdmin ? 'Administrador' : 'Usuario'} · {user.projects_count}{' '}
                          {user.projects_count === 1 ? 'anuncio' : 'anuncios'} · alta{' '}
                          {formatDate(user.created_at)}
                        </ThemedText>
                        {user.suspended_at ? (
                          <ThemedText type="smallBold" style={{ color: theme.danger }}>
                            ⛔ Suspendido desde {formatDate(user.suspended_at)}
                          </ThemedText>
                        ) : null}
                      </View>
                      {!isSelf && !isAdmin ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy === `user:${user.id}`}
                          onPress={() => void toggleSuspension(user)}
                          style={[
                            styles.button,
                            { borderColor: user.suspended_at ? theme.border : theme.danger },
                          ]}>
                          <ThemedText
                            type="smallBold"
                            style={user.suspended_at ? undefined : { color: theme.danger }}>
                            {busy === `user:${user.id}`
                              ? 'Guardando...'
                              : user.suspended_at
                                ? 'Reactivar'
                                : 'Suspender'}
                          </ThemedText>
                        </Pressable>
                      ) : null}
                    </ThemedView>
                  );
                })
              : filteredPosts.map((post) => {
                  const expired = post.expires_at && new Date(post.expires_at).getTime() <= Date.now();
                  const working = busy === `post:${post.id}`;
                  return (
                    <ThemedView
                      key={post.id}
                      type="backgroundElement"
                      style={[styles.item, { borderColor: theme.border }]}>
                      <View style={styles.itemCopy}>
                        <ThemedText type="smallBold">{post.title}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          por {owners[post.owner_id] ?? 'Jugador'} · {formatDate(post.created_at)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {STATUS_LABELS[post.status] ?? post.status}
                          {post.expires_at
                            ? ` · ${expired ? 'venció' : 'vence'} ${formatDate(post.expires_at)}`
                            : ' · sin vencimiento'}
                        </ThemedText>
                      </View>
                      <View style={styles.itemActions}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={working}
                          onPress={() =>
                            void setPostStatus(post, post.status === 'archived' ? 'open' : 'archived')
                          }
                          style={[styles.button, { borderColor: theme.border }]}>
                          <ThemedText type="smallBold">
                            {post.status === 'archived' ? 'Volver a mostrar' : 'Ocultar'}
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Eliminar el anuncio ${post.title}`}
                          disabled={working}
                          onPress={() => void deletePost(post)}
                          style={[styles.button, { borderColor: theme.danger }]}>
                          <ThemedText type="smallBold" style={{ color: theme.danger }}>
                            Eliminar
                          </ThemedText>
                        </Pressable>
                      </View>
                    </ThemedView>
                  );
                })}

            {!loading && !error && tab === 'users' && !filteredUsers.length ? (
              <ThemedText themeColor="textSecondary">No hay usuarios que coincidan.</ThemedText>
            ) : null}
            {!loading && !error && tab === 'posts' && !filteredPosts.length ? (
              <ThemedText themeColor="textSecondary">No hay anuncios que coincidan.</ThemedText>
            ) : null}
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
    maxWidth: 900,
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  item: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  itemCopy: { gap: 2 },
  itemActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  button: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
  pressed: { opacity: 0.72 },
});
