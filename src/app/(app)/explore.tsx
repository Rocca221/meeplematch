import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Choice, SelectedMark } from '@/components/choice';
import { StatusMessage } from '@/components/status-message';
import { ZoomableImage } from '@/components/zoomable-image';
import { Pressable } from '@/components/accessible-pressable';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { LocationAutocompleteField } from '@/components/location-autocomplete-field';
import { PageBanner } from '@/components/page-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloudImages } from '@/constants/cloud-images';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { confirmAction } from '@/lib/confirm';
import { fitImageTo16x9 } from '@/lib/image-fit';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

type Project = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  long_term_goal: string;
  roles_needed: string[];
  location: string | null;
  image_path: string | null;
  desired_players: number | null;
  game_id: string | null;
  custom_game_name: string | null;
  created_at: string;
  expires_at: string | null;
};

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  experience_level: string;
  preferred_game_types: string[];
};

type Game = {
  id: string;
  name: string;
};

type Interest = {
  project_id: string;
  status: string;
};

const emptyForm = {
  title: '',
  description: '',
  longTermGoal: '',
  roles: '',
  location: '',
  desiredPlayers: '',
  gameSearch: '',
  customGame: '',
  durationDays: '30',
};

/** Duraciones rápidas del anuncio; '' = sin vencimiento. */
const DURATION_PRESETS = [
  { label: '3 días', value: '3' },
  { label: '1 semana', value: '7' },
  { label: '2 semanas', value: '14' },
  { label: '1 mes', value: '30' },
  { label: '3 meses', value: '90' },
  { label: 'Sin límite', value: '' },
] as const;

const EXPERIENCE_FILTERS = [
  { value: 'all', label: 'Cualquier nivel' },
  { value: 'beginner', label: 'Inicial' },
  { value: 'casual', label: 'Casual' },
  { value: 'experienced', label: 'Con experiencia' },
  { value: 'expert', label: 'Experto' },
] as const;

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

export default function ProjectsScreen() {
  const { session } = useAuth();
  const { translate } = useLanguage();
  const userId = session?.user.id;
  const theme = useTheme();
  const topInset = useTopInset();
  const { columns, columnWidth, gap: gridGap } = useGridColumns({
    minColumnWidth: 340,
    maxColumns: 2,
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [games, setGames] = useState<Record<string, Game>>({});
  const [interests, setInterests] = useState<Record<string, Interest>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [gameOptions, setGameOptions] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [gameMode, setGameMode] = useState<'catalog' | 'custom'>('catalog');
  const [submittingProject, setSubmittingProject] = useState(false);
  const [activeAction, setActiveAction] = useState('');
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  // El Inicio abre el tablón con `?q=<título>` para mostrar la publicación tocada.
  const { q: searchParam } = useLocalSearchParams<{ q?: string }>();
  const [searchText, setSearchText] = useState(searchParam ?? '');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Si llega otro `?q=` con la pantalla ya abierta, se actualiza la búsqueda
  // durante el render (en vez de en un efecto).
  const [lastSearchParam, setLastSearchParam] = useState(searchParam);
  if (searchParam !== lastSearchParam) {
    setLastSearchParam(searchParam);
    if (typeof searchParam === 'string') setSearchText(searchParam);
  }
  const [gameFilter, setGameFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [experienceFilter, setExperienceFilter] =
    useState<(typeof EXPERIENCE_FILTERS)[number]['value']>('all');
  const [minimumPlayersFilter, setMinimumPlayersFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [projectImageUri, setProjectImageUri] = useState<string | null>(null);
  const [projectImagePath, setProjectImagePath] = useState<string | null>(null);
  const [uploadingProjectImage, setUploadingProjectImage] = useState(false);
  // En edición, la fecha de vencimiento solo cambia si la persona toca la duración.
  const [durationTouched, setDurationTouched] = useState(false);

  const accent = theme.accent;
  const border = theme.border;

  const fetchProjects = useCallback(async () => {
    const { data, error: projectsError } = await supabase
      .from('projects')
      .select(
        'id, owner_id, title, description, long_term_goal, roles_needed, location, image_path, desired_players, game_id, custom_game_name, created_at, expires_at',
      )
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (projectsError) throw projectsError;

    // Los anuncios vencidos solo los sigue viendo su autor (para renovarlos).
    const nowMs = Date.now();
    const projectRows = ((data ?? []) as Project[]).filter(
      (project) =>
        !project.expires_at ||
        new Date(project.expires_at).getTime() > nowMs ||
        project.owner_id === userId,
    );
    if (!projectRows.length) {
      return {
        projects: projectRows,
        players: {} as Record<string, Player>,
        games: {} as Record<string, Game>,
        interests: {} as Record<string, Interest>,
      };
    }

    const ownerIds = [...new Set(projectRows.map((project) => project.owner_id))];
    const gameIds = [
      ...new Set(
        projectRows.flatMap((project) => (project.game_id ? [project.game_id] : [])),
      ),
    ];
    const projectIds = projectRows.map((project) => project.id);

    const [profilesResult, gamesResult, interestsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, display_name, city, experience_level, preferred_game_types',
        )
        .in('id', ownerIds),
      gameIds.length
        ? supabase.from('games').select('id, name').in('id', gameIds)
        : Promise.resolve({ data: [], error: null }),
      userId
        ? supabase
            .from('project_interests')
            .select('project_id, status')
            .eq('user_id', userId)
            .in('project_id', projectIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (gamesResult.error) throw gamesResult.error;
    if (interestsResult.error) throw interestsResult.error;

    return {
      projects: projectRows,
      players: Object.fromEntries(
        ((profilesResult.data ?? []) as Player[]).map((player) => [
          player.id,
          player,
        ]),
      ) as Record<string, Player>,
      games: Object.fromEntries(
        ((gamesResult.data ?? []) as Game[]).map((game) => [game.id, game]),
      ) as Record<string, Game>,
      interests: Object.fromEntries(
        ((interestsResult.data ?? []) as Interest[]).map((interest) => [
          interest.project_id,
          interest,
        ]),
      ) as Record<string, Interest>,
    };
  }, [userId]);

  const applyProjects = useCallback(
    (result: Awaited<ReturnType<typeof fetchProjects>>) => {
      setProjects(result.projects);
      setPlayers(result.players);
      setGames(result.games);
      setInterests(result.interests);
    },
    [],
  );

  const loadProjects = useCallback(async () => {
    try {
      const result = await fetchProjects();
      setError('');
      applyProjects(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudo cargar el tablón de proyectos.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyProjects, fetchProjects]);

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        const result = await fetchProjects();
        if (cancelled) return;
        setError('');
        applyProjects(result);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudo cargar el tablón de proyectos.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [applyProjects, fetchProjects]);

  useEffect(() => {
    let cancelled = false;
    const search = form.gameSearch.trim();

    if (selectedGame || search.length < 2) return;

    const timeout = setTimeout(async () => {
      const { data, error: gamesError } = await supabase
        .from('games')
        .select('id, name')
        .ilike('name', `%${search}%`)
        .order('name')
        .limit(6);

      if (cancelled) return;
      if (gamesError) {
        setNotice(`No se pudieron buscar juegos: ${gamesError.message}`);
        return;
      }
      setGameOptions((data ?? []) as Game[]);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [form.gameSearch, selectedGame]);

  const ownProjectCount = useMemo(
    () => projects.filter((project) => project.owner_id === userId).length,
    [projects, userId],
  );

  const filteredProjects = useMemo(() => {
    const query = normalizeSearchText(searchText.trim());
    const gameQuery = normalizeSearchText(gameFilter.trim());
    const locationQuery = normalizeSearchText(locationFilter.trim());
    const roleQuery = normalizeSearchText(roleFilter.trim());
    const minimumPlayers = Number.parseInt(minimumPlayersFilter, 10);

    return projects
      .filter((project) => {
        const owner = players[project.owner_id];
        const game = project.game_id ? games[project.game_id] : undefined;
        const gameLabel = project.custom_game_name?.trim() || game?.name || '';
        const searchableText = normalizeSearchText(
          [
            project.title,
            project.description,
            project.long_term_goal,
            project.roles_needed.join(' '),
            project.location ?? '',
            owner?.display_name ?? '',
            owner?.preferred_game_types.join(' ') ?? '',
            gameLabel,
          ].join(' '),
        );

        return (
          (!query || searchableText.includes(query)) &&
          (!gameQuery || normalizeSearchText(gameLabel).includes(gameQuery)) &&
          (!locationQuery ||
            normalizeSearchText(project.location ?? '').includes(locationQuery)) &&
          (!roleQuery ||
            project.roles_needed.some((role) =>
              normalizeSearchText(role).includes(roleQuery),
            )) &&
          (experienceFilter === 'all' ||
            owner?.experience_level === experienceFilter) &&
          (!minimumPlayersFilter ||
            (Number.isInteger(minimumPlayers) &&
              minimumPlayers > 0 &&
              project.desired_players !== null &&
              project.desired_players >= minimumPlayers))
        );
      })
      .sort((left, right) => {
        const dateDifference =
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime();
        return sortOrder === 'newest' ? -dateDifference : dateDifference;
      });
  }, [
    experienceFilter,
    gameFilter,
    games,
    locationFilter,
    minimumPlayersFilter,
    players,
    projects,
    roleFilter,
    searchText,
    sortOrder,
  ]);

  const activeFilters = [
    searchText.trim() ? `Búsqueda: «${searchText.trim()}»` : null,
    gameFilter.trim() ? `Juego: «${gameFilter.trim()}»` : null,
    locationFilter.trim() ? `Zona: «${locationFilter.trim()}»` : null,
    roleFilter.trim() ? `Rol: «${roleFilter.trim()}»` : null,
    minimumPlayersFilter.trim() ? `Jugadores desde ${minimumPlayersFilter.trim()}` : null,
    experienceFilter !== 'all'
      ? `Experiencia: ${EXPERIENCE_FILTERS.find((level) => level.value === experienceFilter)?.label ?? experienceFilter}`
      : null,
  ].filter((text): text is string => Boolean(text));

  function clearFilters() {
    setSearchText('');
    setGameFilter('');
    setLocationFilter('');
    setRoleFilter('');
    setExperienceFilter('all');
    setMinimumPlayersFilter('');
    setSortOrder('newest');
  }

  async function createProject() {
    if (!userId) return;
    const roles = form.roles
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean)
      .slice(0, 8);

    if (!form.title.trim() || !form.description.trim()) {
      setNotice('Completa el título y la descripción del anuncio.');
      return;
    }

    const customGameName = form.customGame.trim().replace(/\s+/g, ' ');
    if (gameMode === 'custom' && !customGameName) {
      setNotice('Escribe el nombre de tu juego o elige uno del catálogo.');
      return;
    }
    if (customGameName.length > 120) {
      setNotice('El nombre del juego no puede superar los 120 caracteres.');
      return;
    }

    const desiredPlayers = form.desiredPlayers.trim()
      ? Number(form.desiredPlayers)
      : null;
    if (
      desiredPlayers !== null &&
      (!Number.isInteger(desiredPlayers) || desiredPlayers < 1)
    ) {
      setNotice('La cantidad de jugadores debe ser un número entero positivo.');
      return;
    }

    // undefined = no tocar el vencimiento actual (edición sin cambios).
    let expiresAt: string | null | undefined;
    if (!editingId || durationTouched) {
      const rawDays = form.durationDays.trim();
      if (rawDays === '') {
        expiresAt = null;
      } else {
        const days = Number(rawDays);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
          setNotice('La duración debe ser de 1 a 365 días, o déjala en «Sin límite».');
          return;
        }
        expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      }
    }

    setSubmittingProject(true);
    setNotice('');

    let uploadedImagePath: string | null = null;
    try {
      if (projectImageUri) {
        setUploadingProjectImage(true);
        const response = await fetch(projectImageUri);
        if (!response.ok) {
          throw new Error('No se pudo leer la imagen seleccionada.');
        }
        const imageBlob = await response.blob();
        if (imageBlob.size > 8 * 1024 * 1024) {
          throw new Error('La imagen debe pesar menos de 8 MB.');
        }

        const contentType = imageBlob.type || 'image/jpeg';
        const fileExtension = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        }[contentType];
        if (!fileExtension) {
          throw new Error('Elige una imagen JPG, PNG o WebP.');
        }

        uploadedImagePath = `${userId}/${Date.now()}.${fileExtension}`;
        const { error: uploadError } = await supabase.storage
          .from('project-images')
          .upload(uploadedImagePath, imageBlob, {
            contentType,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        setUploadingProjectImage(false);
      }

      const projectValues = {
        owner_id: userId,
        title: form.title.trim(),
        description: form.description.trim(),
        long_term_goal: form.longTermGoal.trim(),
        roles_needed: roles,
        location: form.location.trim() || null,
        image_path: uploadedImagePath ?? projectImagePath,
        desired_players: desiredPlayers,
        game_id: gameMode === 'catalog' ? selectedGame?.id ?? null : null,
        custom_game_name: gameMode === 'custom' ? customGameName : null,
        ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
      };
      const result = editingId
        ? await supabase
            .from('projects')
            .update(projectValues)
            .eq('id', editingId)
            .eq('owner_id', userId)
        : await supabase.from('projects').insert(projectValues);
      if (result.error) throw result.error;

      const previousImagePath = projectImagePath;
      const savedImagePath = uploadedImagePath ?? projectImagePath;
      let cleanupNotice = '';
      if (previousImagePath && previousImagePath !== savedImagePath) {
        const { error: removeError } = await supabase.storage
          .from('project-images')
          .remove([previousImagePath]);
        if (removeError) {
          cleanupNotice = ` No se pudo borrar la imagen anterior: ${removeError.message}`;
        }
      }

      setForm(emptyForm);
      setSelectedGame(null);
      setGameMode('catalog');
      setProjectImageUri(null);
      setProjectImagePath(null);
      setDurationTouched(false);
      setCreating(false);
      setEditingId(null);
      setNotice(
        `${editingId ? 'Tu anuncio se actualizó.' : 'Tu anuncio ya está publicado.'}${cleanupNotice}`,
      );
      await loadProjects();
    } catch (createError) {
      if (uploadedImagePath) {
        const { error: cleanupError } = await supabase.storage
          .from('project-images')
          .remove([uploadedImagePath]);
        if (cleanupError) {
          setNotice(
            `No se pudo publicar: ${
              createError instanceof Error
                ? createError.message
                : 'Error desconocido.'
            } También falló la limpieza de la imagen: ${cleanupError.message}`,
          );
          return;
        }
      }
      setNotice(
        createError instanceof Error
          ? `No se pudo publicar: ${createError.message}`
          : 'No se pudo publicar el anuncio.',
      );
    } finally {
      setUploadingProjectImage(false);
      setSubmittingProject(false);
    }
  }

  async function expressInterest(project: Project) {
    if (!userId) return;
    const current = interests[project.id];
    if (current) return;

    setActiveAction(project.id);
    setActionErrors((previous) => ({ ...previous, [project.id]: '' }));

    const { error: interestError } = await supabase
      .from('project_interests')
      .insert({ project_id: project.id, user_id: userId });

    if (interestError) {
      setActionErrors((previous) => ({
        ...previous,
        [project.id]: interestError.message,
      }));
    } else {
      setInterests((previous) => ({
        ...previous,
        [project.id]: { project_id: project.id, status: 'pending' },
      }));
    }

    setActiveAction('');
  }

  async function sendInvitation(project: Project) {
    if (!userId || project.owner_id === userId) return;
    const actionKey = `invite:${project.id}`;
    setActiveAction(actionKey);
    setActionErrors((previous) => ({ ...previous, [project.id]: '' }));

    const { error: invitationError } = await supabase.from('invitations').insert({
      sender_id: userId,
      receiver_id: project.owner_id,
    });

    if (invitationError) {
      setActionErrors((previous) => ({
        ...previous,
        [project.id]:
          invitationError.code === '23505'
            ? 'Ya existe una invitación pendiente o aceptada con este jugador.'
            : invitationError.message,
      }));
    } else {
      setActionErrors((previous) => ({
        ...previous,
        [project.id]: 'Invitación enviada. El chat se habilita al aceptarla.',
      }));
    }

    setActiveAction('');
  }

  function editProject(project: Project) {
    setEditingId(project.id);
    setForm({
      title: project.title,
      description: project.description,
      longTermGoal: project.long_term_goal,
      roles: project.roles_needed.join(', '),
      location: project.location ?? '',
      desiredPlayers: project.desired_players?.toString() ?? '',
      gameSearch: project.game_id ? games[project.game_id]?.name ?? '' : '',
      customGame: project.custom_game_name ?? '',
      durationDays: project.expires_at
        ? String(
            Math.max(
              1,
              Math.ceil((new Date(project.expires_at).getTime() - Date.now()) / 86_400_000),
            ),
          )
        : '',
    });
    setDurationTouched(false);
    setGameMode(project.custom_game_name ? 'custom' : 'catalog');
    setProjectImageUri(null);
    setProjectImagePath(project.image_path);
    setSelectedGame(
      project.game_id && games[project.game_id] ? games[project.game_id] : null,
    );
    setCreating(true);
    setNotice('');
  }

  async function chooseProjectImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) throw new Error('No se pudo leer la imagen seleccionada.');
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        throw new Error('La imagen debe pesar menos de 8 MB.');
      }

      setProjectImageUri(await fitImageTo16x9(asset.uri));
      setNotice('');
    } catch (imageError) {
      setNotice(
        imageError instanceof Error
          ? imageError.message
          : 'No se pudo seleccionar la imagen.',
      );
    }
  }

  async function closeProject(project: Project) {
    setActiveAction(`close:${project.id}`);
    setActionErrors((previous) => ({ ...previous, [project.id]: '' }));
    const { error: closeError } = await supabase
      .from('projects')
      .update({ status: 'closed' })
      .eq('id', project.id)
      .eq('owner_id', userId);

    if (closeError) {
      setActionErrors((previous) => ({
        ...previous,
        [project.id]: closeError.message,
      }));
    } else {
      await loadProjects();
    }
    setActiveAction('');
  }

  async function deleteProject(project: Project) {
    if (!userId) return;
    const confirmed = await confirmAction(
      'Eliminar anuncio',
      `Se eliminará «${project.title}» junto con sus interesados. Esta acción no se puede deshacer.`,
      'Eliminar',
    );
    if (!confirmed) return;

    setActiveAction(`delete:${project.id}`);
    setActionErrors((previous) => ({ ...previous, [project.id]: '' }));
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', project.id)
      .eq('owner_id', userId);

    if (deleteError) {
      setActionErrors((previous) => ({
        ...previous,
        [project.id]: deleteError.message,
      }));
    } else {
      if (project.image_path) {
        // Si falla, el anuncio ya está borrado; solo queda un archivo huérfano.
        await supabase.storage.from('project-images').remove([project.image_path]);
      }
      setNotice('Tu anuncio se eliminó.');
      await loadProjects();
    }
    setActiveAction('');
  }

  /** Cierra la ventana de publicar/editar y descarta lo escrito. */
  function closeForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
    setSelectedGame(null);
    setGameMode('catalog');
    setProjectImageUri(null);
    setProjectImagePath(null);
    setDurationTouched(false);
    setNotice('');
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingTop: Spacing.five + topInset }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadProjects();
              }}
              tintColor={accent}
            />
          }>
          <PageBanner image={CloudImages.board} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                COMUNIDAD MEEPLEMATCH
              </ThemedText>
              <ThemedText type="title" style={styles.title}>
                Tablón
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Encuentra tu equipo y construyan algo juntos.
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotice('');
                setCreating(true);
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.accentFill },
                pressed && styles.pressed,
              ]}>
              <ThemedText style={styles.primaryButtonText}>+ Publicar</ThemedText>
            </Pressable>
          </View>

          {!creating ? (
            <ThemedView type="backgroundElement" style={styles.summary}>
              <ThemedText type="smallBold">
                {projects.length}{' '}
                {projects.length === 1 ? 'proyecto abierto' : 'proyectos abiertos'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {ownProjectCount} tuyos
              </ThemedText>
            </ThemedView>
          ) : null}

          {!creating ? (
            <ThemedView type="backgroundElement" style={styles.searchCard}>
            <View style={styles.searchHeader}>
              <View style={styles.searchTitleCopy}>
                <ThemedText type="smallBold">Encuentra tu próxima mesa</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {filteredProjects.length} de {projects.length} anuncios
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: filtersExpanded }}
                onPress={() => setFiltersExpanded((expanded) => !expanded)}
                style={[styles.filterToggle, { borderColor: border }]}>
                <ThemedText type="smallBold" style={{ color: accent }}>
                  {filtersExpanded ? 'Menos filtros' : 'Filtros avanzados'}
                </ThemedText>
              </Pressable>
            </View>
            <LocalizedTextInput
              accessibilityLabel="Buscar proyectos"
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Buscar por título, objetivo, descripción o jugador"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="search"
              style={[styles.input, { color: theme.text, borderColor: border }]}
            />
            {activeFilters.length ? (
              <View style={styles.activeFilters} accessibilityLiveRegion="polite">
                <ThemedText type="smallBold">
                  {`Filtros activos (${activeFilters.length}):`}
                </ThemedText>
                {activeFilters.map((text) => (
                  <View key={text} style={[styles.activeFilterChip, { borderColor: accent }]}>
                    <ThemedText type="small">{text}</ThemedText>
                  </View>
                ))}
                <Pressable
                  accessibilityLabel="Quitar todos los filtros"
                  onPress={clearFilters}
                  style={styles.clearFiltersButton}>
                  <ThemedText type="smallBold" style={{ color: accent }}>
                    ✕ Quitar filtros
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
            {filtersExpanded ? (
              <View style={styles.advancedFilters}>
                <Field
                  label="Juego"
                  value={gameFilter}
                  placeholder="Ej. Catan"
                  onChangeText={setGameFilter}
                  borderColor={border}
                  textColor={theme.text}
                  multiline={false}
                />
                <LocationAutocompleteField
                  label="Zona o modalidad"
                  value={locationFilter}
                  placeholder="Busca una ciudad o escribe «en línea»"
                  borderColor={border}
                  onChangeText={setLocationFilter}
                  onSelect={setLocationFilter}
                />
                <View style={styles.fieldRow}>
                  <View style={styles.halfField}>
                    <Field
                      label="Rol que buscas"
                      value={roleFilter}
                      placeholder="Ej. narrador"
                      onChangeText={setRoleFilter}
                      borderColor={border}
                      textColor={theme.text}
                      multiline={false}
                    />
                  </View>
                </View>
                <Field
                  label="Jugadores buscados (mínimo)"
                  value={minimumPlayersFilter}
                  placeholder="Cualquier cantidad"
                  keyboardType="number-pad"
                  onChangeText={(value) =>
                    setMinimumPlayersFilter(value.replace(/\D/g, '').slice(0, 2))
                  }
                  borderColor={border}
                  textColor={theme.text}
                  multiline={false}
                />
                <View style={styles.filterGroup}>
                  <ThemedText type="smallBold">Experiencia de quien publica</ThemedText>
                  <View style={styles.chipRow}>
                    {EXPERIENCE_FILTERS.map((level) => {
                      const selected = experienceFilter === level.value;
                      return (
                        <Pressable
                          key={level.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setExperienceFilter(level.value)}
                          style={[
                            styles.filterChip,
                            { borderColor: selected ? accent : border },
                            selected && styles.selectedFilterChip,
                          ]}>
                          <View style={styles.chipContent}>
                            <SelectedMark selected={selected} />
                            <ThemedText
                              type="small"
                              style={selected ? { color: accent } : undefined}>
                              {level.label}
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.filterFooter}>
                  <View style={styles.chipRow}>
                    {([
                      ['newest', 'Más recientes'],
                      ['oldest', 'Más antiguos'],
                    ] as const).map(([order, label]) => (
                      <Pressable
                        key={order}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sortOrder === order }}
                        onPress={() => setSortOrder(order)}
                        style={[
                          styles.filterChip,
                          { borderColor: sortOrder === order ? accent : border },
                          sortOrder === order && styles.selectedFilterChip,
                        ]}>
                        <View style={styles.chipContent}>
                          <SelectedMark selected={sortOrder === order} />
                          <ThemedText
                            type="small"
                            style={sortOrder === order ? { color: accent } : undefined}>
                            {label}
                          </ThemedText>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={clearFilters}
                    style={styles.clearFiltersButton}>
                    <ThemedText type="smallBold" style={{ color: accent }}>
                      Limpiar
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            </ThemedView>
          ) : null}

          {/* Ventana a pantalla completa y opaca: mientras está abierta no se ve
              ni se puede tocar el resto del tablón. */}
          <Modal animationType="slide" onRequestClose={closeForm} visible={creating}>
            <ThemedView style={styles.formModalScreen}>
              <SafeAreaView style={styles.formModalSafe}>
                <KeyboardAvoidingView style={styles.formModalSafe} behavior="padding">
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    contentContainerStyle={styles.formModalContent}>
                    <View style={styles.formModalBar}>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {editingId ? 'EDITAR ANUNCIO' : 'NUEVO ANUNCIO'}
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Cerrar sin guardar"
                        disabled={submittingProject}
                        onPress={closeForm}
                        style={({ pressed }) => [
                          styles.formModalClose,
                          { borderColor: border },
                          pressed && styles.pressed,
                        ]}>
                        <ThemedText type="smallBold">✕ Cerrar</ThemedText>
                      </Pressable>
                    </View>
            <ThemedView type="backgroundElement" style={styles.formCard}>
              <ThemedText type="subtitle" style={styles.formTitle}>
                {editingId ? 'Edita tu búsqueda' : 'Publica una búsqueda'}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Cuenta qué quieres crear y qué personas necesitas para lograrlo.
              </ThemedText>

              <ThemedText type="small" themeColor="textSecondary">
                Los campos marcados con * son obligatorios.
              </ThemedText>
              <Field
                required
                label="Título"
                value={form.title}
                placeholder="Ej. Campaña de rol de larga duración"
                onChangeText={(title) => setForm((value) => ({ ...value, title }))}
                borderColor={border}
                textColor={theme.text}
                multiline={false}
              />
              <Field
                required
                label="Descripción"
                value={form.description}
                placeholder="Describe el grupo y cómo serán las partidas."
                onChangeText={(description) =>
                  setForm((value) => ({ ...value, description }))
                }
                borderColor={border}
                textColor={theme.text}
                multiline
              />
              <Field
                label="Objetivo a largo plazo"
                value={form.longTermGoal}
                placeholder="¿Qué les gustaría conseguir como equipo?"
                onChangeText={(longTermGoal) =>
                  setForm((value) => ({ ...value, longTermGoal }))
                }
                borderColor={border}
                textColor={theme.text}
                multiline
              />
              <Field
                label="Roles que buscas"
                value={form.roles}
                placeholder="Ej. narrador, estratega, organizador"
                helper="Separa los roles con comas."
                onChangeText={(roles) => setForm((value) => ({ ...value, roles }))}
                borderColor={border}
                textColor={theme.text}
                multiline={false}
              />

              <LocationAutocompleteField
                label="Ubicación"
                value={form.location}
                placeholder="Busca una ciudad o escribe «en línea»"
                borderColor={border}
                onChangeText={(location) =>
                  setForm((value) => ({ ...value, location }))
                }
                onSelect={(location) =>
                  setForm((value) => ({ ...value, location }))
                }
              />
              <Field
                label="Jugadores buscados"
                value={form.desiredPlayers}
                placeholder="Ej. 3"
                keyboardType="number-pad"
                onChangeText={(desiredPlayers) =>
                  setForm((value) => ({ ...value, desiredPlayers }))
                }
                borderColor={border}
                textColor={theme.text}
                multiline={false}
              />

              <View style={styles.field}>
                <ThemedText type="smallBold">Duración del anuncio</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {editingId && !durationTouched
                    ? 'Sin cambios: se mantiene la fecha de vencimiento actual. Elige otra duración para volver a contar desde hoy.'
                    : 'Cuánto tiempo quieres que esté abierto. Al vencer deja de verse para los demás y puedes renovarlo editándolo.'}
                </ThemedText>
                <View style={styles.fieldRow}>
                  {DURATION_PRESETS.map((preset) => (
                    <Choice
                      key={preset.label}
                      role="button"
                      label={preset.label}
                      selected={form.durationDays === preset.value}
                      onPress={() => {
                        setDurationTouched(true);
                        setForm((value) => ({ ...value, durationDays: preset.value }));
                      }}
                    />
                  ))}
                </View>
                <Field
                  label="Días abiertos (personalizado)"
                  value={form.durationDays}
                  placeholder="Ej. 45"
                  helper="De 1 a 365 días. Vacío = sin vencimiento."
                  keyboardType="number-pad"
                  onChangeText={(durationDays) => {
                    setDurationTouched(true);
                    setForm((value) => ({
                      ...value,
                      durationDays: durationDays.replace(/[^0-9]/g, ''),
                    }));
                  }}
                  borderColor={border}
                  textColor={theme.text}
                  multiline={false}
                />
              </View>

              <View style={styles.field}>
                <ThemedText type="smallBold">Imagen del anuncio</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  JPG, PNG o WebP · hasta 8 MB
                </ThemedText>
                {projectImageUri || projectImagePath ? (
                  <Image
                    alt="Vista previa de la imagen del anuncio"
                    source={
                      projectImageUri
                        ? { uri: projectImageUri }
                        : {
                            uri: supabase.storage
                              .from('project-images')
                              .getPublicUrl(projectImagePath ?? '').data.publicUrl,
                          }
                    }
                    contentFit="cover"
                    style={styles.projectImagePreview}
                  />
                ) : null}
                <View style={styles.imageActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={uploadingProjectImage || submittingProject}
                    onPress={() => void chooseProjectImage()}
                    style={[
                      styles.imageAction,
                      { borderColor: border },
                      (uploadingProjectImage || submittingProject) && styles.disabled,
                    ]}>
                    <ThemedText type="smallBold" style={{ color: accent }}>
                      {projectImageUri || projectImagePath
                        ? 'Cambiar imagen'
                        : 'Agregar imagen'}
                    </ThemedText>
                  </Pressable>
                  {projectImageUri || projectImagePath ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={uploadingProjectImage || submittingProject}
                      onPress={() => {
                        setProjectImageUri(null);
                        setProjectImagePath(null);
                      }}
                      style={[
                        styles.imageAction,
                        { borderColor: border },
                        (uploadingProjectImage || submittingProject) && styles.disabled,
                      ]}>
                      <ThemedText type="smallBold">Quitar</ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.field}>
                <ThemedText type="smallBold">Juego (opcional)</ThemedText>
                <View style={styles.gameModeRow}>
                  {(
                    [
                      ['catalog', 'Del catálogo'],
                      ['custom', 'Personalizado'],
                    ] as const
                  ).map(([mode, label]) => {
                    const active = gameMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setGameMode(mode)}
                        style={[
                          styles.gameModeOption,
                          {
                            borderColor: active ? theme.accentFill : border,
                            backgroundColor: active ? theme.accentFill : 'transparent',
                          },
                        ]}>
                        <View style={styles.chipContent}>
                          {active ? (
                            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                              ✓
                            </ThemedText>
                          ) : null}
                          <ThemedText
                            type="smallBold"
                            style={{ color: active ? theme.onAccent : theme.text }}>
                            {label}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {gameMode === 'custom' ? (
                  <LocalizedTextInput
                    accessibilityLabel="Nombre del juego personalizado"
                    value={form.customGame}
                    maxLength={120}
                    onChangeText={(customGame) =>
                      setForm((value) => ({ ...value, customGame }))
                    }
                    placeholder="Escribe el nombre de tu juego"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, borderColor: border }]}
                  />
                ) : (
                  <>
                {selectedGame ? (
                  <View style={styles.selectedGame}>
                    <ThemedText type="smallBold">{selectedGame.name}</ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedGame(null);
                        setForm((value) => ({ ...value, gameSearch: '' }));
                      }}>
                      <ThemedText style={{ color: accent }}>Cambiar</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <LocalizedTextInput
                      accessibilityLabel="Buscar juego"
                      value={form.gameSearch}
                      onChangeText={(gameSearch) => {
                        setForm((value) => ({ ...value, gameSearch }))
                        if (gameSearch.trim().length < 2) setGameOptions([])
                      }}
                      placeholder="Busca en el catálogo sincronizado"
                      placeholderTextColor={theme.textSecondary}
                      style={[
                        styles.input,
                        { color: theme.text, borderColor: border },
                      ]}
                    />
                    {gameOptions.map((game) => (
                      <Pressable
                        key={game.id}
                        onPress={() => {
                          setSelectedGame(game);
                          setForm((value) => ({ ...value, gameSearch: game.name }));
                          setGameOptions([]);
                        }}
                        style={styles.gameOption}>
                        <ThemedText>{game.name}</ThemedText>
                      </Pressable>
                    ))}
                  </>
                )}
                  </>
                )}
              </View>

              {notice ? (
                <StatusMessage kind={notice.startsWith('Tu anuncio') ? 'success' : 'error'}>
                  {notice}
                </StatusMessage>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={submittingProject}
                onPress={createProject}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.submitButton,
                  { backgroundColor: theme.accentFill },
                  pressed && styles.pressed,
                ]}>
                <ThemedText style={styles.primaryButtonText}>
                  {submittingProject
                    ? uploadingProjectImage
                      ? 'Subiendo imagen...'
                      : 'Guardando...'
                    : editingId
                      ? 'Guardar cambios'
                      : 'Publicar anuncio'}
                </ThemedText>
              </Pressable>
            </ThemedView>
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </ThemedView>
          </Modal>

          {notice && !creating ? (
            <ThemedText style={styles.notice}>{notice}</ThemedText>
          ) : null}

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
              <ThemedText themeColor="textSecondary">Cargando proyectos...</ThemedText>
            </View>
          ) : error ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="subtitle" style={styles.formTitle}>
                No pudimos cargar el tablón
              </ThemedText>
              <StatusMessage kind="error">{error}</StatusMessage>
              <ActionButton
                label="Reintentar"
                onPress={() => {
                  setLoading(true);
                  void loadProjects();
                }}
                accent={theme.accentFill}
              />
            </ThemedView>
          ) : projects.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText style={styles.emptyIcon}>♟</ThemedText>
              <ThemedText type="subtitle" style={styles.formTitle}>
                El tablero está listo
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>
                Todavía no hay búsquedas abiertas. Publica la primera y reúne a tu
                próximo equipo.
              </ThemedText>
            </ThemedView>
          ) : filteredProjects.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText style={styles.emptyIcon}>⌕</ThemedText>
              <ThemedText type="subtitle" style={styles.formTitle}>
                No hay coincidencias
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.emptyCopy}>
                Prueba otros términos o limpia los filtros para ver todos los
                proyectos abiertos.
              </ThemedText>
              <ActionButton
                label="Limpiar filtros"
                onPress={clearFilters}
                accent={theme.accentFill}
              />
            </ThemedView>
          ) : (
            <View style={[styles.projectList, columns > 1 && styles.projectGrid, { gap: gridGap }]}>
              {filteredProjects.map((project) => {
                const owner = players[project.owner_id];
                const game = project.game_id ? games[project.game_id] : undefined;
                const gameLabel = project.custom_game_name?.trim() || game?.name;
                const interest = interests[project.id];
                const isOwner = project.owner_id === userId;
                const interestLabel =
                  interest?.status === 'accepted'
                    ? 'Interés aceptado'
                    : interest
                      ? 'Interés enviado'
                      : 'Me interesa';

                return (
                  <ThemedView
                    key={project.id}
                    type="backgroundElement"
                    style={[styles.projectCard, columnWidth ? { width: columnWidth } : null]}>
                    {project.image_path ? (
                      <ZoomableImage
                        uri={
                          supabase.storage
                            .from('project-images')
                            .getPublicUrl(project.image_path).data.publicUrl
                        }
                        alt={`Imagen de la mesa: ${project.title}`}
                        style={styles.projectCardImage}
                      />
                    ) : null}
                    <View style={styles.projectCardBody}>
                    <View style={styles.projectTopline}>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {gameLabel ?? 'PROYECTO DE COMUNIDAD'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {new Date(project.created_at).toLocaleDateString()}
                      </ThemedText>
                    </View>
                    <ThemedText type="subtitle" style={styles.projectTitle}>
                      {project.title}
                    </ThemedText>
                    <ThemedText style={styles.projectDescription}>
                      {project.description}
                    </ThemedText>

                    {project.long_term_goal ? (
                      <View style={styles.goalBlock}>
                        <ThemedText type="smallBold">Objetivo del equipo</ThemedText>
                        <ThemedText themeColor="textSecondary">
                          {project.long_term_goal}
                        </ThemedText>
                      </View>
                    ) : null}

                    {project.roles_needed.length ? (
                      <View style={styles.rolesBlock}>
                        <ThemedText type="smallBold">Roles que busca</ThemedText>
                        <View style={styles.chipRow}>
                          {project.roles_needed.map((role) => (
                            <View
                              key={`${project.id}-${role}`}
                              style={[styles.chip, { borderColor: border }]}>
                              <ThemedText type="small">{role}</ThemedText>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.metaRow}>
                      {project.location ? (
                        <Meta label="Ubicación" value={project.location} />
                      ) : null}
                      {project.desired_players ? (
                        <Meta
                          label="Equipo"
                          value={`${project.desired_players} jugadores`}
                        />
                      ) : null}
                      {project.expires_at ? (
                        <Meta
                          label={
                            new Date(project.expires_at).getTime() <= Date.now()
                              ? 'Venció'
                              : 'Vence'
                          }
                          value={formatExpiry(project.expires_at)}
                        />
                      ) : null}
                    </View>

                    <View style={[styles.ownerRow, { borderTopColor: border }]}>
                      <View style={styles.avatar}>
                        <ThemedText style={styles.avatarText}>
                          {(owner?.display_name || 'J').slice(0, 1).toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={styles.ownerCopy}>
                        <ThemedText type="smallBold">
                          {owner?.display_name ?? 'Jugador MeepleMatch'}
                        </ThemedText>
                        {owner?.experience_level ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {experienceLabel(owner.experience_level)}
                            {owner.preferred_game_types.length
                              ? ` · ${owner.preferred_game_types
                                  .slice(0, 2)
                                  .map(translate)
                                  .join(', ')}`
                              : ''}
                          </ThemedText>
                        ) : null}
                        {owner?.city ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {owner.city}
                          </ThemedText>
                        ) : null}
                      </View>
                      {!isOwner ? (
                        <View style={styles.actionColumn}>
                          <ActionButton
                            label={interestLabel}
                            onPress={() => void expressInterest(project)}
                            accent={theme.accentFill}
                            disabled={Boolean(interest) || activeAction === project.id}
                          />
                          <Pressable
                            accessibilityRole="button"
                            disabled={activeAction === `invite:${project.id}`}
                            onPress={() => void sendInvitation(project)}
                            style={({ pressed }) => [
                              styles.invitationButton,
                              { borderColor: border },
                              pressed && styles.pressed,
                            ]}>
                            <ThemedText type="smallBold">
                              {activeAction === `invite:${project.id}`
                                ? 'Enviando...'
                                : 'Invitar a jugar'}
                            </ThemedText>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.ownerActions}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => editProject(project)}
                            style={[styles.invitationButton, { borderColor: border }]}>
                            <ThemedText type="smallBold">Editar</ThemedText>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            disabled={activeAction === `close:${project.id}`}
                            onPress={() => void closeProject(project)}
                            style={[styles.invitationButton, { borderColor: border }]}>
                            <ThemedText type="smallBold">
                              {activeAction === `close:${project.id}`
                                ? 'Cerrando...'
                                : 'Cerrar'}
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Eliminar el anuncio ${project.title}`}
                            disabled={activeAction === `delete:${project.id}`}
                            onPress={() => void deleteProject(project)}
                            style={[styles.invitationButton, { borderColor: theme.danger }]}>
                            <ThemedText type="smallBold" style={{ color: theme.danger }}>
                              {activeAction === `delete:${project.id}`
                                ? 'Eliminando...'
                                : 'Eliminar'}
                            </ThemedText>
                          </Pressable>
                        </View>
                      )}
                    </View>
                    {actionErrors[project.id] ? (
                      <StatusMessage
                        kind={
                          actionErrors[project.id].startsWith('Invitación enviada')
                            ? 'success'
                            : 'error'
                        }>
                        {actionErrors[project.id]}
                      </StatusMessage>
                    ) : null}
                    </View>
                  </ThemedView>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Field({
  label,
  value,
  placeholder,
  helper,
  onChangeText,
  borderColor,
  textColor,
  multiline,
  keyboardType,
  required = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  helper?: string;
  onChangeText: (text: string) => void;
  borderColor: string;
  textColor: string;
  multiline: boolean;
  keyboardType?: 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {required ? (
          <ThemedText type="smallBold" accessibilityElementsHidden importantForAccessibility="no">
            *
          </ThemedText>
        ) : null}
      </View>
      <LocalizedTextInput
        accessibilityLabel={required ? `${label} (obligatorio)` : label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.multiline,
          { borderColor, color: textColor },
        ]}
      />
      {helper ? (
        <ThemedText type="small" themeColor="textSecondary">
          {helper}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function formatExpiry(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function experienceLabel(level: string) {
  switch (level) {
    case 'casual':
      return 'Jugador casual';
    case 'experienced':
      return 'Con experiencia';
    case 'expert':
      return 'Jugador experto';
    default:
      return 'Está empezando';
  }
}

function ActionButton({
  label,
  onPress,
  accent,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: accent },
        (pressed || disabled) && styles.pressed,
      ]}>
      <ThemedText style={styles.actionButtonText}>{label}</ThemedText>
    </Pressable>
  );
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
    paddingHorizontal: Spacing.four,
    paddingBottom: 120,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
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
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summary: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  searchCard: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  searchHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  searchTitleCopy: {
    flex: 1,
    gap: 2,
  },
  filterToggle: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  advancedFilters: {
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  filterGroup: {
    gap: Spacing.two,
  },
  filterChip: {
    minHeight: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  selectedFilterChip: {
    backgroundColor: 'rgba(87, 112, 190, 0.1)',
  },
  filterFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  clearFiltersButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  formCard: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  formModalScreen: {
    flex: 1,
  },
  formModalSafe: {
    flex: 1,
  },
  formModalContent: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  formModalBar: {
    width: '100%',
    maxWidth: 760,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formModalClose: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  formTitle: {
    fontSize: 23,
    lineHeight: 30,
  },
  labelRow: {
    flexDirection: 'row',
    gap: 4,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  activeFilterChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  halfField: {
    flex: 1,
    minWidth: 140,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  multiline: {
    minHeight: 92,
    paddingVertical: Spacing.two,
  },
  selectedGame: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
  },
  gameModeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  gameModeOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
  gameOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  submitButton: {
    marginTop: Spacing.one,
  },
  notice: {
    color: '#20834A',
  },
  centered: {
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
  emptyIcon: {
    fontSize: 38,
  },
  emptyCopy: {
    textAlign: 'center',
    maxWidth: 360,
  },
  projectList: {
    gap: Spacing.three,
  },
  projectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  projectCard: {
    padding: 0,
    borderRadius: 20,
    overflow: 'hidden',
  },
  projectCardBody: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  projectCardImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  projectImagePreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
  },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  imageAction: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.55,
  },
  projectTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
    marginBottom: -Spacing.two,
  },
  projectTitle: {
    fontSize: 24,
    lineHeight: 31,
  },
  projectDescription: {
    lineHeight: 23,
  },
  goalBlock: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: 'rgba(100, 120, 160, 0.09)',
  },
  rolesBlock: {
    gap: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
  },
  metaItem: {
    gap: Spacing.one,
  },
  ownerRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7383C2',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  ownerCopy: {
    flex: 1,
    minWidth: 120,
    gap: 2,
  },
  actionColumn: {
    gap: Spacing.one,
    minWidth: 145,
  },
  ownerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: 11,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  invitationButton: {
    minHeight: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  success: {
    color: '#20834A',
  },
  error: {
    color: '#C73535',
  },
  pressed: {
    opacity: 0.72,
  },
});
