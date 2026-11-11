import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameFacts } from '@/components/game-facts';
import { StatusMessage } from '@/components/status-message';
import { ZoomableImage } from '@/components/zoomable-image';
import { SelectedMark } from '@/components/choice';
import { Pressable } from '@/components/accessible-pressable';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { PageBanner } from '@/components/page-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloudImages } from '@/constants/cloud-images';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';
import { useTopInset } from '@/hooks/use-top-inset';
import { gameCoverUrl } from '@/lib/game-cover';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type UserGame = {
  game_id: string;
  status: 'owned' | 'wishlist' | 'played';
  rating: number | null;
  notes: string;
};

type Game = {
  id: string;
  name: string;
  description: string;
  min_players: number | null;
  max_players: number | null;
  playing_time_minutes: number | null;
  year_published: number | null;
  publisher: string | null;
  cover_path: string | null;
};

type LibraryGame = UserGame & { game: Game };

const LIBRARY_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'owned', label: 'En mi colección' },
  { value: 'played', label: 'Jugados' },
  { value: 'wishlist', label: 'Por jugar' },
] as const;

const GAME_STATUSES = [
  { value: 'owned', label: 'En mi colección' },
  { value: 'played', label: 'Ya lo jugué' },
  { value: 'wishlist', label: 'Quiero jugarlo' },
] as const;

function normalizeGameName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

export default function LibraryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const theme = useTheme();
  const topInset = useTopInset();
  const accent = theme.accent;
  const { columns, columnWidth, gap: gridGap } = useGridColumns({
    minColumnWidth: 340,
    maxColumns: 3,
    gap: Spacing.two,
  });
  const [library, setLibrary] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<(typeof LIBRARY_FILTERS)[number]['value']>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState<Game[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof GAME_STATUSES)[number]['value']>('owned');
  const [savingGame, setSavingGame] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminFormOpen, setAdminFormOpen] = useState(false);
  const [editingCatalogGameId, setEditingCatalogGameId] = useState<string | null>(
    null,
  );
  const [savingCatalogGame, setSavingCatalogGame] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [catalogForm, setCatalogForm] = useState({
    name: '',
    description: '',
    minPlayers: '',
    maxPlayers: '',
    playingTime: '',
    yearPublished: '',
    publisher: '',
    coverPath: '',
  });

  const loadLibrary = useCallback(async () => {
    if (!userId) return;
    setError('');

    const [libraryResult, adminResult] = await Promise.all([
      supabase
        .from('user_games')
        .select('game_id, status, rating, notes')
        .eq('user_id', userId)
        .order('added_at', { ascending: false }),
      supabase.rpc('is_admin'),
    ]);

    if (libraryResult.error) {
      setError(libraryResult.error.message);
      return;
    }
    if (adminResult.error) {
      setError(adminResult.error.message);
      return;
    }

    setIsAdmin(adminResult.data === true);
    const userGames = (libraryResult.data ?? []) as UserGame[];
    if (!userGames.length) {
      setLibrary([]);
      return;
    }

    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select(
        'id, name, description, min_players, max_players, playing_time_minutes, year_published, publisher, cover_path',
      )
      .in(
        'id',
        userGames.map((item) => item.game_id),
      );

    if (gamesError) {
      setError(gamesError.message);
      return;
    }

    const gamesById = Object.fromEntries(
      ((games ?? []) as Game[]).map((game) => [game.id, game]),
    ) as Record<string, Game>;
    setLibrary(
      userGames.flatMap((item) => {
        const game = gamesById[item.game_id];
        return game ? [{ ...item, game }] : [];
      }),
    );
  }, [userId]);

  const filteredLibrary = useMemo(() => {
    const query = normalizeGameName(search.trim());

    return library
      .filter((item) => {
        const name = normalizeGameName(item.game.name);
        return (
          (!query || name.includes(query)) &&
          (statusFilter === 'all' || item.status === statusFilter)
        );
      })
      .sort((left, right) => left.game.name.localeCompare(right.game.name));
  }, [library, search, statusFilter]);

  const ownedGameIds = useMemo(
    () => new Set(library.map((item) => item.game_id)),
    [library],
  );

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      setLoading(true);
      await loadLibrary();
      if (active) setLoading(false);
    }

    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadLibrary]);

  useEffect(() => {
    const query = catalogSearch.trim();
    let active = true;
    const timeout = setTimeout(async () => {
      if (query.length < 2) {
        setCatalogResults([]);
        setCatalogLoading(false);
        return;
      }

      setCatalogLoading(true);
      const { data, error: catalogError } = await supabase
        .from('games')
        .select(
          'id, name, description, min_players, max_players, playing_time_minutes, year_published, publisher, cover_path',
        )
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20);

      if (!active) return;
      if (catalogError) {
        setError(catalogError.message);
        setCatalogResults([]);
      } else {
        setError('');
        setCatalogResults((data ?? []) as Game[]);
      }
      setCatalogLoading(false);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [catalogSearch]);

  async function refresh() {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  }

  function openGame(game: Game, status?: UserGame['status']) {
    setSelectedGame(game);
    setSelectedStatus(
      status ?? library.find((item) => item.game_id === game.id)?.status ?? 'owned',
    );
  }

  async function addGameToLibrary() {
    if (!userId || !selectedGame) return;
    setSavingGame(true);
    setMessage('');
    setError('');

    try {
      const { error: insertError } = await supabase.from('user_games').insert({
        user_id: userId,
        game_id: selectedGame.id,
        status: selectedStatus,
      });
      if (insertError) throw insertError;
      setSelectedGame(null);
      setMessage(`${selectedGame.name} se agregó a tu colección.`);
      await loadLibrary();
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : 'No se pudo agregar el juego a tu colección.',
      );
    } finally {
      setSavingGame(false);
    }
  }

  async function updateGameStatus(gameId: string, status: UserGame['status']) {
    if (!userId) return;
    const { error: updateError } = await supabase
      .from('user_games')
      .update({ status })
      .eq('user_id', userId)
      .eq('game_id', gameId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLibrary((current) =>
      current.map((item) =>
        item.game_id === gameId ? { ...item, status } : item,
      ),
    );
    setSelectedStatus(status);
  }

  async function createCatalogGame() {
    const name = catalogForm.name.trim();
    if (!name) {
      setError('El nombre del juego es obligatorio.');
      return;
    }

    function optionalInteger(value: string, label: string, maximum: number) {
      if (!value.trim()) return null;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw new Error(`${label} debe ser un número entero entre 1 y ${maximum}.`);
      }
      return parsed;
    }

    setSavingCatalogGame(true);
    setError('');
    setMessage('');

    try {
      const minPlayers = optionalInteger(catalogForm.minPlayers, 'Mínimo de jugadores', 100);
      const maxPlayers = optionalInteger(catalogForm.maxPlayers, 'Máximo de jugadores', 100);
      const playingTime = optionalInteger(catalogForm.playingTime, 'Duración', 10000);
      const year = optionalInteger(catalogForm.yearPublished, 'Año', 9999);
      if (year !== null && year < 1000) {
        throw new Error('El año debe ser igual o posterior al año 1000.');
      }
      if (minPlayers !== null && maxPlayers !== null && maxPlayers < minPlayers) {
        throw new Error('El máximo de jugadores no puede ser menor que el mínimo.');
      }

      const values = {
        name,
        description: catalogForm.description.trim(),
        min_players: minPlayers,
        max_players: maxPlayers,
        playing_time_minutes: playingTime,
        year_published: year,
        publisher: catalogForm.publisher.trim() || null,
        cover_path: catalogForm.coverPath.trim() || null,
      };
      const query = editingCatalogGameId
        ? supabase
            .from('games')
            .update(values)
            .eq('id', editingCatalogGameId)
        : supabase.from('games').insert(values);
      const { data, error: saveError } = await query
        .select(
          'id, name, description, min_players, max_players, playing_time_minutes, year_published, publisher, cover_path',
        )
        .single();

      if (saveError) throw saveError;
      const createdGame = data as Game;
      setCatalogForm({
        name: '',
        description: '',
        minPlayers: '',
        maxPlayers: '',
        playingTime: '',
        yearPublished: '',
        publisher: '',
        coverPath: '',
      });
      setCatalogSearch(name);
      setAdminFormOpen(false);
      setEditingCatalogGameId(null);
      setMessage(
        editingCatalogGameId
          ? `${createdGame.name} se actualizó en el catálogo.`
          : `${createdGame.name} se agregó al catálogo.`,
      );
      openGame(createdGame);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'No se pudo agregar el juego al catálogo.',
      );
    } finally {
      setSavingCatalogGame(false);
    }
  }

  function editCatalogGame(game: Game) {
    setCatalogForm({
      name: game.name,
      description: game.description,
      minPlayers: game.min_players?.toString() ?? '',
      maxPlayers: game.max_players?.toString() ?? '',
      playingTime: game.playing_time_minutes?.toString() ?? '',
      yearPublished: game.year_published?.toString() ?? '',
      publisher: game.publisher ?? '',
      coverPath: game.cover_path ?? '',
    });
    setEditingCatalogGameId(game.id);
    setAdminFormOpen(true);
    setSelectedGame(null);
    setError('');
  }

  async function uploadCatalogCover() {
    if (!userId || !isAdmin) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const contentType = asset.mimeType ?? 'image/jpeg';
      const fileExtension = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }[contentType];
      if (!fileExtension) {
        throw new Error('Elige una imagen JPG, PNG o WebP.');
      }
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        throw new Error('La portada debe pesar menos de 8 MB.');
      }

      setUploadingCover(true);
      setError('');
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('No se pudo leer la imagen elegida.');
      const imageBlob = await response.arrayBuffer();
      if (imageBlob.byteLength > 8 * 1024 * 1024) {
        throw new Error('La portada debe pesar menos de 8 MB.');
      }

      const path = `catalog/${userId}/${Date.now()}.${fileExtension}`;
      const { error: uploadError } = await supabase.storage
        .from('game-covers')
        .upload(path, imageBlob, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      setCatalogForm((form) => ({ ...form, coverPath: path }));
      setMessage('Portada subida. Guarda la ficha para aplicarla al juego.');
    } catch (coverError) {
      setError(
        coverError instanceof Error
          ? coverError.message
          : 'No se pudo subir la portada.',
      );
    } finally {
      setUploadingCover(false);
    }
  }

  async function removeGame(gameId: string) {
    if (!userId) return;
    setError('');
    const { error: deleteError } = await supabase
      .from('user_games')
      .delete()
      .eq('user_id', userId)
      .eq('game_id', gameId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setLibrary((current) => current.filter((item) => item.game_id !== gameId));
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingTop: Spacing.four + topInset }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={accent}
            />
          }>
          <PageBanner image={CloudImages.library} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                TU COLECCIÓN
              </ThemedText>
              <ThemedText type="title" style={styles.title}>
                Mis juegos
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Catálogo de MeepleMatch y colección personal.
              </ThemedText>
            </View>
            <View style={[styles.countBadge, { backgroundColor: theme.accentFill }]}>
              <ThemedText style={styles.countText}>{library.length}</ThemedText>
            </View>
          </View>

          <ThemedView type="backgroundElement" style={styles.catalogCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Catálogo de juegos
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Busca juegos en MeepleMatch y agrégalos a tu colección.
            </ThemedText>
            <LocalizedTextInput
              accessibilityLabel="Buscar en el catálogo de juegos"
              value={catalogSearch}
              onChangeText={setCatalogSearch}
              placeholder="Escribe al menos 2 letras"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              style={[
                styles.searchInput,
                { color: theme.text, borderColor: theme.textSecondary },
              ]}
            />
            {catalogLoading ? (
              <ActivityIndicator accessibilityLabel="Cargando" color={accent} />
            ) : catalogSearch.trim().length >= 2 && catalogResults.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No encontramos juegos con ese nombre en el catálogo.
              </ThemedText>
            ) : (
              catalogResults.map((game) => (
                <View key={game.id} style={[styles.catalogResult, { borderColor: theme.textSecondary }]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openGame(game)}
                    style={styles.catalogResultCopy}>
                    <ThemedText type="smallBold">{game.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {game.min_players && game.max_players
                        ? `${game.min_players}–${game.max_players} jugadores`
                        : 'Ver detalles'}
                    </ThemedText>
                  </Pressable>
                  {ownedGameIds.has(game.id) ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      En tu colección
                    </ThemedText>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openGame(game)}
                      style={[styles.addButton, { backgroundColor: theme.accentFill }]}>
                      <ThemedText style={styles.addButtonText}>Agregar</ThemedText>
                    </Pressable>
                  )}
                </View>
              ))
            )}
            {isAdmin ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAdminFormOpen((open) => !open);
                  setEditingCatalogGameId(null);
                  setCatalogForm({
                    name: '',
                    description: '',
                    minPlayers: '',
                    maxPlayers: '',
                    playingTime: '',
                    yearPublished: '',
                    publisher: '',
                    coverPath: '',
                  });
                }}
                style={[styles.adminToggle, { borderColor: theme.textSecondary }]}>
                <ThemedText type="smallBold" style={{ color: accent }}>
                  {adminFormOpen ? 'Cancelar alta' : 'Agregar juego al catálogo'}
                </ThemedText>
              </Pressable>
            ) : null}
          </ThemedView>

          {adminFormOpen && isAdmin ? (
            <ThemedView type="backgroundElement" style={styles.adminForm}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {editingCatalogGameId ? 'Editar juego' : 'Alta de juego'}
              </ThemedText>
              <CatalogField
                label="Nombre *"
                value={catalogForm.name}
                onChangeText={(name) => setCatalogForm((form) => ({ ...form, name }))}
                placeholder="Nombre del juego"
                theme={theme}
              />
              <CatalogField
                label="Descripción"
                value={catalogForm.description}
                onChangeText={(description) => setCatalogForm((form) => ({ ...form, description }))}
                placeholder="Descripción breve"
                theme={theme}
                multiline
              />
              <View style={styles.fieldRow}>
                <CatalogField
                  label="Mín. jugadores"
                  value={catalogForm.minPlayers}
                  onChangeText={(minPlayers) => setCatalogForm((form) => ({ ...form, minPlayers }))}
                  placeholder="1"
                  theme={theme}
                  keyboardType="number-pad"
                />
                <CatalogField
                  label="Máx. jugadores"
                  value={catalogForm.maxPlayers}
                  onChangeText={(maxPlayers) => setCatalogForm((form) => ({ ...form, maxPlayers }))}
                  placeholder="4"
                  theme={theme}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.fieldRow}>
                <CatalogField
                  label="Duración (min)"
                  value={catalogForm.playingTime}
                  onChangeText={(playingTime) => setCatalogForm((form) => ({ ...form, playingTime }))}
                  placeholder="60"
                  theme={theme}
                  keyboardType="number-pad"
                />
                <CatalogField
                  label="Año"
                  value={catalogForm.yearPublished}
                  onChangeText={(yearPublished) => setCatalogForm((form) => ({ ...form, yearPublished }))}
                  placeholder="2025"
                  theme={theme}
                  keyboardType="number-pad"
                />
              </View>
              <CatalogField
                label="Editorial"
                value={catalogForm.publisher}
                onChangeText={(publisher) => setCatalogForm((form) => ({ ...form, publisher }))}
                placeholder="Nombre de la editorial"
                theme={theme}
              />
              <View style={styles.field}>
                <ThemedText type="smallBold">Portada del juego</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Selecciona una imagen JPG, PNG o WebP de hasta 8 MB.
                </ThemedText>
                <View style={styles.coverUploadRow}>
                  <GameCover
                    coverPath={catalogForm.coverPath || null}
                    name={catalogForm.name || 'Portada del juego'}
                  />
                  <View style={styles.coverUploadCopy}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={uploadingCover || savingCatalogGame}
                      onPress={() => void uploadCatalogCover()}
                      style={[
                        styles.adminToggle,
                        { borderColor: theme.textSecondary },
                        (uploadingCover || savingCatalogGame) && styles.disabled,
                      ]}>
                      <ThemedText type="smallBold" style={{ color: accent }}>
                        {uploadingCover
                          ? 'Subiendo portada...'
                          : catalogForm.coverPath
                            ? 'Cambiar imagen'
                            : 'Elegir imagen'}
                      </ThemedText>
                    </Pressable>
                    {catalogForm.coverPath ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setCatalogForm((form) => ({ ...form, coverPath: '' }))
                        }>
                        <ThemedText type="small" themeColor="textSecondary">
                          Quitar portada seleccionada
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <CatalogField
                  label="O pega una ruta existente (opcional)"
                  value={catalogForm.coverPath}
                  onChangeText={(coverPath) =>
                    setCatalogForm((form) => ({ ...form, coverPath }))
                  }
                  placeholder="catalog/juego.jpg"
                  theme={theme}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={savingCatalogGame || uploadingCover}
                onPress={() => void createCatalogGame()}
                style={[styles.primaryButton, { backgroundColor: theme.accentFill }, savingCatalogGame && styles.disabled]}>
                <ThemedText style={styles.addButtonText}>
                  {savingCatalogGame
                    ? 'Guardando...'
                    : editingCatalogGameId
                      ? 'Guardar cambios'
                      : 'Guardar en catálogo'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {message ? <StatusMessage kind="success">{message}</StatusMessage> : null}
          {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}

          {!loading && library.length ? (
            <ThemedView type="backgroundElement" style={styles.searchCard}>
              <ThemedText type="smallBold">Buscar en mi biblioteca</ThemedText>
              <LocalizedTextInput
                accessibilityLabel="Buscar juegos de mi biblioteca"
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar un juego por nombre"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="search"
                style={[
                  styles.searchInput,
                  { color: theme.text, borderColor: theme.textSecondary },
                ]}
              />
              <View style={styles.filterRow}>
                {LIBRARY_FILTERS.map((filter) => {
                  const selected = statusFilter === filter.value;
                  return (
                    <Pressable
                      key={filter.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setStatusFilter(filter.value)}
                      style={[
                        styles.filterChip,
                        { borderColor: selected ? accent : theme.textSecondary },
                        selected && styles.selectedFilter,
                      ]}>
                      <View style={styles.chipContent}>
                        <SelectedMark selected={selected} />
                        <ThemedText
                          type="small"
                          style={selected ? { color: accent } : undefined}>
                          {filter.label}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                {filteredLibrary.length} de {library.length} juegos
                {statusFilter !== 'all' || search.trim()
                  ? ` · Filtros activos: ${[
                      statusFilter !== 'all'
                        ? `estado «${LIBRARY_FILTERS.find((f) => f.value === statusFilter)?.label}»`
                        : null,
                      search.trim() ? `búsqueda «${search.trim()}»` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}`
                  : ''}
              </ThemedText>
              {statusFilter !== 'all' || search.trim() ? (
                <Pressable
                  accessibilityLabel="Quitar todos los filtros"
                  onPress={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  style={[styles.clearFilters, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold" style={{ color: accent }}>
                    ✕ Quitar filtros
                  </ThemedText>
                </Pressable>
              ) : null}
            </ThemedView>
          ) : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
              <ThemedText themeColor="textSecondary">
                Cargando tu biblioteca...
              </ThemedText>
            </View>
          ) : library.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText style={styles.emptyEmoji}>🎲</ThemedText>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Tu colección está vacía
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>
                Busca un juego en el catálogo de MeepleMatch para empezar a
                construir tu biblioteca.
              </ThemedText>
            </ThemedView>
          ) : filteredLibrary.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                No encontramos juegos
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>
                Ajusta la búsqueda o el filtro de estado para ver otros juegos.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={[styles.gameList, columns > 1 && styles.gameGrid, { gap: gridGap }]}>
              {filteredLibrary.map((item) => (
                <ThemedView
                  key={item.game_id}
                  type="backgroundElement"
                  style={[styles.gameCard, columnWidth ? { width: columnWidth } : null]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openGame(item.game, item.status)}
                    style={styles.gameDetailsButton}>
                    <GameCover
                      coverPath={item.game.cover_path}
                      name={item.game.name}
                    />
                    <View style={styles.gameCopy}>
                      <ThemedText type="smallBold" style={styles.gameName}>
                        {item.game.name}
                      </ThemedText>
                      <GameFacts
                        minPlayers={item.game.min_players}
                        maxPlayers={item.game.max_players}
                        minutes={item.game.playing_time_minutes}
                        year={item.game.year_published}
                      />
                      <View style={[styles.statusPill, { borderColor: accent }]}>
                        <ThemedText type="smallBold" style={{ color: accent }}>
                          {statusIcon(item.status)}
                        </ThemedText>
                        <ThemedText type="smallBold">{statusLabel(item.status)}</ThemedText>
                      </View>
                      <ThemedText type="small" style={{ color: accent }}>
                        Ver detalles →
                      </ThemedText>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${item.game.name} de la biblioteca`}
                    onPress={() => void removeGame(item.game_id)}
                    style={styles.removeButton}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Quitar
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ))}
            </View>
          )}
        </ScrollView>
        <Modal
          animationType="slide"
          onRequestClose={() => setSelectedGame(null)}
          transparent
          visible={selectedGame !== null}>
          <View style={styles.modalBackdrop}>
            <ThemedView type="backgroundElement" style={styles.detailsModal}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.detailsContent}>
                {selectedGame ? (
                  <>
                    <View style={styles.detailsHeader}>
                      <ThemedText type="subtitle" style={styles.sectionTitle}>
                        Detalles del juego
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setSelectedGame(null)}>
                        <ThemedText type="smallBold" style={{ color: accent }}>
                          Cerrar
                        </ThemedText>
                      </Pressable>
                    </View>
                    <View style={styles.detailsHero}>
                      <GameCover
                        coverPath={selectedGame.cover_path}
                        name={selectedGame.name}
                        key={selectedGame.id}
                        zoomable
                      />
                      <View style={styles.detailsCopy}>
                        <ThemedText type="subtitle">{selectedGame.name}</ThemedText>
                        {selectedGame.publisher ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {selectedGame.publisher}
                          </ThemedText>
                        ) : null}
                        <GameFacts
                          minPlayers={selectedGame.min_players}
                          maxPlayers={selectedGame.max_players}
                          minutes={selectedGame.playing_time_minutes}
                          year={selectedGame.year_published}
                        />
                      </View>
                    </View>
                    <ThemedText themeColor="textSecondary">
                      {selectedGame.description || 'Este juego todavía no tiene una descripción.'}
                    </ThemedText>
                    <ThemedText type="smallBold">Estado en tu colección</ThemedText>
                    <View style={styles.filterRow}>
                      {GAME_STATUSES.map((status) => {
                        const active = selectedStatus === status.value;
                        return (
                          <Pressable
                            key={status.value}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => {
                              setSelectedStatus(status.value);
                              if (ownedGameIds.has(selectedGame.id)) {
                                void updateGameStatus(selectedGame.id, status.value);
                              }
                            }}
                            style={[
                              styles.filterChip,
                              { borderColor: active ? accent : theme.textSecondary },
                              active && styles.selectedFilter,
                            ]}>
                            <View style={styles.chipContent}>
                              <SelectedMark selected={active} />
                              <ThemedText
                                type="small"
                                style={active ? { color: accent } : undefined}>
                                {status.label}
                              </ThemedText>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                    {!ownedGameIds.has(selectedGame.id) ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={savingGame}
                        onPress={() => void addGameToLibrary()}
                        style={[styles.primaryButton, { backgroundColor: theme.accentFill }, savingGame && styles.disabled]}>
                        <ThemedText style={styles.addButtonText}>
                          {savingGame ? 'Agregando...' : 'Agregar a mi colección'}
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {isAdmin ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => editCatalogGame(selectedGame)}
                        style={[styles.adminToggle, { borderColor: theme.textSecondary }]}>
                        <ThemedText type="smallBold" style={{ color: accent }}>
                          Editar ficha del catálogo
                        </ThemedText>
                      </Pressable>
                    ) : null}
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

function statusIcon(status: UserGame['status']) {
  if (status === 'wishlist') return '☆';
  if (status === 'played') return '▶';
  return '✓';
}

function statusLabel(status: UserGame['status']) {
  if (status === 'wishlist') return 'Lista de deseos';
  if (status === 'played') return 'Jugado';
  return 'En tu colección';
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
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    minWidth: 50,
    height: 50,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  catalogCard: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  adminForm: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 29,
  },
  field: {
    flex: 1,
    gap: Spacing.one,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  adminToggle: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  coverUploadCopy: {
    flex: 1,
    gap: Spacing.two,
  },
  catalogResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  catalogResultCopy: {
    flex: 1,
    gap: 2,
  },
  addButton: {
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchCard: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  searchInput: {
    minHeight: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  filterChip: {
    minHeight: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  selectedFilter: {
    backgroundColor: 'rgba(87, 112, 190, 0.1)',
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
  },
  clearFilters: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  loading: {
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
    borderRadius: 20,
  },
  emptyEmoji: {
    fontSize: 42,
  },
  emptyCopy: {
    maxWidth: 400,
    textAlign: 'center',
  },
  gameList: {
    gap: Spacing.two,
  },
  gameGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: 16,
  },
  gameDetailsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  gameArtwork: {
    width: 56,
    height: 68,
    borderRadius: 12,
    backgroundColor: 'rgba(100, 120, 160, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  dice: {
    fontSize: 26,
  },
  gameCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  gameName: {
    fontSize: 16,
  },
  removeButton: {
    padding: Spacing.two,
  },
  success: {
    color: '#20834A',
  },
  error: {
    color: '#C73535',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  detailsModal: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
  },
  detailsContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  detailsHeroArtwork: {
    width: 88,
    height: 104,
  },
  detailsCopy: {
    flex: 1,
    gap: Spacing.one,
  },
});

function GameCover({
  coverPath,
  name,
  zoomable = false,
}: {
  coverPath: string | null;
  name: string;
  zoomable?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const { effective } = useAccessibility();
  const effectiveTransition = effective.reduceMotion ? 0 : 150;
  const uri = gameCoverUrl(coverPath);

  return (
    <View style={styles.gameArtwork}>
      {uri && !imageFailed && zoomable ? (
        <ZoomableImage uri={uri} alt={`Portada de ${name}`} style={styles.coverImage} />
      ) : uri && !imageFailed ? (
        <Image
          alt={`Portada de ${name}`}
          accessibilityLabel={`Portada de ${name}`}
          contentFit="cover"
          onError={() => setImageFailed(true)}
          source={{ uri }}
          style={styles.coverImage}
          transition={effectiveTransition}
        />
      ) : (
        <ThemedText style={styles.dice}>🎲</ThemedText>
      )}
    </View>
  );
}

function CatalogField({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  multiline = false,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  theme: { text: string; textSecondary: string };
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <LocalizedTextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        style={[
          styles.searchInput,
          multiline && { minHeight: 90, paddingVertical: Spacing.two },
          { color: theme.text, borderColor: theme.textSecondary },
        ]}
      />
    </View>
  );
}
