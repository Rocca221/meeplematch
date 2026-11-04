import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pressable } from '@/components/accessible-pressable';
import { StatusMessage } from '@/components/status-message';
import { CloudImage } from '@/components/cloud-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloudImages, pickCardFallback } from '@/constants/cloud-images';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useGridColumns } from '@/hooks/use-grid-columns';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import {
  compareNearby,
  formatAge,
  getNearbyTier,
  type NearbyTier,
} from '@/lib/nearby';
import { gameCoverUrl } from '@/lib/game-cover';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

/** Publicaciones cercanas que se muestran como máximo en el carrusel. */
const MAX_NEARBY = 12;
/** Publicaciones recientes que se muestran si no hay ninguna cercana. */
const MAX_FALLBACK = 6;
/** Ventana de publicaciones abiertas que se evalúa para calcular cercanía. */
const PROJECT_WINDOW = 200;

type Profile = {
  display_name: string;
  bio: string;
  city: string | null;
};

type ProjectRow = {
  id: string;
  title: string;
  description: string;
  location: string | null;
  desired_players: number | null;
  image_path: string | null;
  game_id: string | null;
  custom_game_name: string | null;
  created_at: string;
};

type GameRow = {
  id: string;
  name: string;
  cover_path: string | null;
};

type NearbyProject = ProjectRow & {
  tier: NearbyTier;
  gameName: string | null;
  coverPath: string | null;
};

function projectImageUri(project: NearbyProject) {
  if (project.image_path) {
    return supabase.storage.from('project-images').getPublicUrl(project.image_path)
      .data.publicUrl;
  }
  const coverUrl = gameCoverUrl(project.coverPath);
  if (coverUrl) return coverUrl;
  return pickCardFallback(project.id);
}

export default function HomeScreen() {
  const { session } = useAuth();
  const { language, translate } = useLanguage();
  const userId = session?.user.id;
  const theme = useTheme();
  const topInset = useTopInset();
  const { width: windowWidth } = useWindowDimensions();
  const carouselCardWidth = Math.max(260, Math.min(windowWidth - 64, 360));
  const { columns, columnWidth, gap: gridGap, isWide } = useGridColumns({
    minColumnWidth: 300,
    maxColumns: 3,
  });
  const cardWidth = columnWidth ?? carouselCardWidth;
  const { accent, onAccent, border, silver } = theme;
  const t = (spanish: string, english: string) =>
    language === 'en' ? english : spanish;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<NearbyProject[]>([]);
  const [scope, setScope] = useState<'all' | 'city'>('all');
  const [gameCount, setGameCount] = useState(0);
  const [invitationCount, setInvitationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!userId) return;
    setDashboardError('');

    const [profileResult, projectsResult, gamesResult, invitationsResult] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, bio, city')
          .eq('id', userId)
          .single(),
        // El filtro por zona se hace después, sobre una ventana amplia: si se
        // limitara a las más recientes, las cercanas más antiguas quedarían
        // fuera antes de poder compararlas.
        supabase
          .from('projects')
          .select(
            'id, title, description, location, desired_players, image_path, game_id, custom_game_name, created_at',
          )
          .eq('status', 'open')
          .neq('owner_id', userId)
          .order('created_at', { ascending: false })
          .limit(PROJECT_WINDOW),
        supabase
          .from('user_games')
          .select('game_id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('invitations')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', userId)
          .eq('status', 'pending'),
      ]);

    const queryError =
      profileResult.error ??
      projectsResult.error ??
      gamesResult.error ??
      invitationsResult.error;
    if (queryError) {
      setDashboardError(
        `No se pudo cargar toda tu actividad: ${queryError.message}`,
      );
      return;
    }

    const currentProfile = profileResult.data as Profile;
    const city = currentProfile.city?.trim() || null;

    const scored = ((projectsResult.data ?? []) as ProjectRow[]).map(
      (project) => ({ ...project, tier: getNearbyTier(project.location, city) }),
    );
    const nearby = scored
      .filter((project) => project.tier !== 'none')
      .sort(compareNearby);
    // Sin coincidencias, se muestran las más recientes (ya vienen ordenadas).
    const shown = nearby.length
      ? nearby.slice(0, MAX_NEARBY)
      : scored.slice(0, MAX_FALLBACK);

    const gameIds = [
      ...new Set(
        shown
          .map((project) => project.game_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const gamesById = new Map<string, GameRow>();
    let partialError = '';
    if (gameIds.length) {
      const { data: gameRows, error: catalogError } = await supabase
        .from('games')
        .select('id, name, cover_path')
        .in('id', gameIds);
      if (catalogError) {
        partialError = `No se pudieron cargar los juegos de las publicaciones: ${catalogError.message}`;
      } else {
        for (const game of (gameRows ?? []) as GameRow[]) {
          gamesById.set(game.id, game);
        }
      }
    }

    setProfile(currentProfile);
    setProjects(
      shown.map((project) => {
        const game = project.game_id ? gamesById.get(project.game_id) : undefined;
        return {
          ...project,
          gameName: project.custom_game_name?.trim() || game?.name || null,
          coverPath: game?.cover_path ?? null,
        };
      }),
    );
    setGameCount(gamesResult.count ?? 0);
    setInvitationCount(invitationsResult.count ?? 0);
    if (partialError) setDashboardError(partialError);
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      setLoading(true);
      try {
        await loadDashboard();
      } catch (error) {
        if (active) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : 'No se pudo cargar tu actividad.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadDashboard]);

  async function refresh() {
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : 'No se pudo actualizar.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setSignOutError('');

    try {
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutError(error.message);
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'No se pudo cerrar la sesión.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  const city = profile?.city?.trim() || null;
  const isFallback = projects.length > 0 && projects.every((p) => p.tier === 'none');
  const cityCount = projects.filter((project) => project.tier === 'city').length;
  const areaCount = projects.filter((project) => project.tier === 'area').length;
  const showScopeChips = !isFallback && cityCount > 0 && areaCount > 0;
  const activeScope = showScopeChips ? scope : 'all';
  const visibleProjects =
    activeScope === 'city'
      ? projects.filter((project) => project.tier === 'city')
      : projects;

  const tierBadge: Record<
    NearbyTier,
    { label: string; background: string; color: string; borderColor: string }
  > = {
    city: {
      label: t('Tu ciudad', 'Your city'),
      background: theme.accentFill,
      color: onAccent,
      borderColor: theme.accentFill,
    },
    area: {
      label: t('Tu zona', 'Your area'),
      background: '#C5CCD6',
      color: '#0B0D10',
      borderColor: '#C5CCD6',
    },
    none: {
      label: t('Reciente', 'Recent'),
      background: 'rgba(11,13,16,0.78)',
      color: '#E6EAF0',
      borderColor: 'rgba(197,204,214,0.55)',
    },
  };

const projectCards = visibleProjects.map((project) => {
                    const badge = tierBadge[project.tier];
                    return (
                      <Link
                        key={project.id}
                        href={{ pathname: '/explore', params: { q: project.title } }}
                        asChild>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={[
                            project.title,
                            project.gameName,
                            project.location,
                            badge.label,
                          ]
                            .filter(Boolean)
                            .join('. ')}
                          accessibilityHint={t(
                            'Abre el tablón con esta búsqueda',
                            'Opens the board with this search',
                          )}
                          style={({ pressed }) => [
                            { width: cardWidth },
                            pressed && styles.pressed,
                          ]}>
                          <ThemedView
                            type="backgroundElement"
                            style={[styles.projectCard, { borderColor: border }]}>
                            <View>
                              <CloudImage
                                uri={projectImageUri(project)}
                                style={styles.projectImage}
                              />
                              <View
                                style={[
                                  styles.badge,
                                  {
                                    backgroundColor: badge.background,
                                    borderColor: badge.borderColor,
                                  },
                                ]}>
                                <ThemedText
                                  type="smallBold"
                                  style={[styles.badgeText, { color: badge.color }]}>
                                  {badge.label}
                                </ThemedText>
                              </View>
                              {project.gameName ? (
                                <View style={styles.gameStrip}>
                                  <ThemedText
                                    type="smallBold"
                                    numberOfLines={1}
                                    style={styles.gameStripText}>
                                    {project.gameName}
                                  </ThemedText>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.projectCardContent}>
                              <ThemedText
                                numberOfLines={2}
                                style={styles.projectTitle}>
                                {project.title}
                              </ThemedText>
                              <ThemedText
                                type="small"
                                numberOfLines={2}
                                themeColor="textSecondary">
                                {project.description}
                              </ThemedText>
                              <View style={[styles.rule, { backgroundColor: border }]} />
                              {project.location ? (
                                <ThemedText
                                  type="small"
                                  numberOfLines={1}
                                  themeColor="textSecondary">
                                  {project.location}
                                </ThemedText>
                              ) : null}
                              <ThemedText type="smallBold" style={{ color: accent }}>
                                {project.desired_players
                                  ? t(
                                      `Busca ${project.desired_players} jugadores`,
                                      `Wants ${project.desired_players} players`,
                                    ) + ' · '
                                  : ''}
                                {formatAge(project.created_at, language)}
                              </ThemedText>
                            </View>
                          </ThemedView>
                        </Pressable>
                      </Link>
                    );
                  });

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
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.kickerRow}>
                <View style={[styles.diamond, { backgroundColor: theme.accentFill }]} />
                <ThemedText
                  type="smallBold"
                  themeColor="textSecondary"
                  style={styles.kicker}>
                  MEEPLEMATCH
                </ThemedText>
              </View>
              <ThemedText type="title" style={styles.title}>
                {profile?.display_name
                  ? `${translate('¡Hola')}, ${profile.display_name}!`
                  : `${translate('¡Hola')}!`}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                Tu próxima gran partida empieza con una buena compañía.
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={signingOut}
              onPress={signOut}
              style={({ pressed }) => [
                styles.signOutButton,
                { borderColor: border },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={styles.upper}>
                {signingOut ? 'Saliendo...' : 'Salir'}
              </ThemedText>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
              <ThemedText themeColor="textSecondary">
                Preparando tu mesa...
              </ThemedText>
            </View>
          ) : (
            <>
              {dashboardError ? (
                <ThemedView
                  type="backgroundElement"
                  style={[styles.errorCard, { borderColor: border }]}>
                  <StatusMessage kind="error">{dashboardError}</StatusMessage>
                </ThemedView>
              ) : null}

              <View style={[styles.topRow, isWide && styles.topRowWide]}>
              <View style={[styles.statsRow, isWide && styles.statsColumn]}>
                <StatTile
                  label="Mis juegos"
                  value={gameCount}
                  color={accent}
                  borderColor={border}
                  href="/library"
                />
                <StatTile
                  label="Invitaciones"
                  value={invitationCount}
                  color={silver}
                  borderColor={border}
                  href="/messages"
                />
              </View>

              <ThemedView
                type="backgroundElement"
                style={[styles.heroCard, { borderColor: border }, isWide && styles.heroWide]}>
                <View style={styles.heroMain}>
                <View style={[styles.heroBar, { backgroundColor: theme.accentFill }]} />
                <View style={styles.heroCopy}>
                  <ThemedText
                    type="smallBold"
                    themeColor="textSecondary"
                    style={styles.kicker}>
                    {t('NUEVA CAMPAÑA', 'NEW CAMPAIGN')}
                  </ThemedText>
                  <ThemedText type="subtitle" style={styles.heroTitle}>
                    ¿Buscas tu próximo equipo?
                  </ThemedText>
                  <ThemedText themeColor="textSecondary">
                    Descubre proyectos abiertos o publica la idea que quieres
                    convertir en una gran campaña.
                  </ThemedText>
                  <Link href="/explore" asChild>
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.heroButton,
                        { backgroundColor: theme.accentFill },
                        pressed && styles.pressed,
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={[styles.upper, { color: onAccent }]}>
                        Explorar el tablón
                      </ThemedText>
                    </Pressable>
                  </Link>
                </View>
                </View>
                <CloudImage
                  uri={CloudImages.home}
                  style={isWide ? styles.heroImageSide : styles.heroImageTop}
                />
              </ThemedView>
              </View>

              <SectionHeader
                title={
                  isFallback
                    ? t('Mesas abiertas recientes', 'Recent open tables')
                    : t('Mesas cerca de ti', 'Tables near you')
                }
                subtitle={
                  city
                    ? isFallback
                      ? t(
                          `Aún no hay mesas en ${city}. Mientras tanto, mira las más recientes.`,
                          `No tables in ${city} yet. Here are the most recent ones.`,
                        )
                      : t(`Anuncios en tu zona: ${city}`, `Listings near ${city}`)
                    : t(
                        'Agrega tu ubicación para ver mesas cercanas.',
                        'Add your location to see nearby tables.',
                      )
                }
                actionLabel={t('Ver todos', 'See all')}
                accent={accent}
                rule={border}
              />

              {showScopeChips ? (
                <View style={styles.filterRow}>
                  <FilterChip
                    label={`${t('Todas', 'All')} (${projects.length})`}
                    selected={activeScope === 'all'}
                    accent={theme.accentFill}
                    onAccent={onAccent}
                    border={border}
                    onPress={() => setScope('all')}
                  />
                  <FilterChip
                    label={`${t('Mi ciudad', 'My city')} (${cityCount})`}
                    selected={activeScope === 'city'}
                    accent={theme.accentFill}
                    onAccent={onAccent}
                    border={border}
                    onPress={() => setScope('city')}
                  />
                </View>
              ) : null}

              {visibleProjects.length ? (
                columns > 1 ? (
                  <View style={[styles.grid, { gap: gridGap }]}>{projectCards}</View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carousel}
                    snapToInterval={carouselCardWidth + Spacing.two}
                    decelerationRate="fast">
                    {projectCards}
                  </ScrollView>
                )
              ) : (
                <ThemedView
                  type="backgroundElement"
                  style={[styles.emptyProjects, { borderColor: border }]}>
                  <ThemedText type="smallBold">
                    {city
                      ? t(
                          'Todavía no hay mesas abiertas',
                          'There are no open tables yet',
                        )
                      : t(
                          'Indica tu ubicación para ver anuncios cercanos',
                          'Add your location to see nearby listings',
                        )}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {city
                      ? t(
                          'Sé la primera persona en publicar una mesa en tu zona desde el tablón.',
                          'Be the first to post a table in your area from the board.',
                        )
                      : t(
                          'Puedes agregar tu ciudad desde tu perfil.',
                          'You can add your city from your profile.',
                        )}
                  </ThemedText>
                  <Link href={city ? '/explore' : '/profile'} asChild>
                    <Pressable>
                      <ThemedText type="smallBold" style={{ color: accent }}>
                        {city
                          ? t('Publicar una mesa', 'Post a table')
                          : t('Completar ubicación', 'Add location')}
                      </ThemedText>
                    </Pressable>
                  </Link>
                </ThemedView>
              )}

              {isFallback && !city ? (
                <Link href="/profile" asChild>
                  <Pressable>
                    <ThemedText type="smallBold" style={{ color: accent }}>
                      {t('Completar ubicación', 'Add location')}
                    </ThemedText>
                  </Pressable>
                </Link>
              ) : null}

              <View style={styles.quickActions}>
                <QuickAction
                  title="Completa tu perfil"
                  subtitle="Cuéntale a la comunidad qué te gusta."
                  color={accent}
                  borderColor={border}
                  href="/profile"
                />
                <QuickAction
                  title={t('Completa tu colección', 'Complete your collection')}
                  subtitle={t(
                    'Agrega juegos y encuentra nuevas mesas.',
                    'Add games and find new tables.',
                  )}
                  color={silver}
                  borderColor={border}
                  href="/library"
                />
              </View>
            </>
          )}

          {signOutError ? (
            <StatusMessage kind="error">{signOutError}</StatusMessage>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SectionHeader({
  title,
  subtitle,
  actionLabel,
  accent,
  rule,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  accent: string;
  rule: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTop}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {title}
        </ThemedText>
        <Link href="/explore" asChild>
          <Pressable accessibilityRole="link">
            <ThemedText type="smallBold" style={[styles.upper, { color: accent }]}>
              {actionLabel}
            </ThemedText>
          </Pressable>
        </Link>
      </View>
      <View style={styles.sectionRule}>
        <View style={[styles.ruleAccent, { backgroundColor: accent }]} />
        <View style={[styles.ruleLine, { backgroundColor: rule }]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {subtitle}
      </ThemedText>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  accent,
  onAccent,
  border,
  onPress,
}: {
  label: string;
  selected: boolean;
  accent: string;
  onAccent: string;
  border: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: accent, borderColor: accent }
          : { borderColor: border },
        pressed && styles.pressed,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {selected ? (
          <ThemedText type="smallBold" style={{ color: onAccent }}>
            ✓
          </ThemedText>
        ) : null}
        <ThemedText
          type="smallBold"
          style={[styles.upper, selected ? { color: onAccent } : undefined]}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function StatTile({
  label,
  value,
  color,
  borderColor,
  href,
}: {
  label: string;
  value: number;
  color: string;
  borderColor: string;
  href: '/library' | '/messages';
}) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" style={{ flex: 1 }}>
        <ThemedView
          type="backgroundElement"
          style={[styles.statCard, { borderColor }]}>
          <View style={[styles.statBar, { backgroundColor: color }]} />
          <ThemedText type="subtitle" style={styles.statValue}>
            {value}
          </ThemedText>
          <ThemedText
            type="smallBold"
            themeColor="textSecondary"
            style={styles.statLabel}>
            {label}
          </ThemedText>
        </ThemedView>
      </Pressable>
    </Link>
  );
}

function QuickAction({
  title,
  subtitle,
  color,
  borderColor,
  href,
}: {
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  href: '/profile' | '/library';
}) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" style={{ flex: 1 }}>
        <ThemedView
          type="backgroundElement"
          style={[styles.quickCard, { borderColor }]}>
          <View style={[styles.quickMark, { backgroundColor: color }]} />
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        </ThemedView>
      </Pressable>
    </Link>
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
    padding: Spacing.four,
    paddingBottom: 120,
    gap: Spacing.three,
  },
  upper: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: Spacing.two,
    gap: Spacing.two,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  diamond: {
    width: 8,
    height: 8,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  kicker: {
    letterSpacing: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: 700,
  },
  signOutButton: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: Spacing.three,
    gap: Spacing.half,
  },
  statBar: {
    width: '100%',
    height: 3,
    marginBottom: Spacing.two,
  },
  statValue: {
    fontFamily: Fonts.serif,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: 700,
  },
  statLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    lineHeight: 16,
  },
  heroCard: {
    flexDirection: 'column-reverse',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroBar: {
    width: 5,
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  heroTitle: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: 700,
  },
  heroButton: {
    minHeight: 42,
    borderRadius: 6,
    paddingHorizontal: Spacing.four,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  sectionHeader: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  sectionTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionTitle: {
    flexShrink: 1,
    fontFamily: Fonts.serif,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sectionRule: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleAccent: {
    width: 36,
    height: 3,
    borderRadius: 1,
  },
  ruleLine: {
    flex: 1,
    height: 1,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 34,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  carousel: {
    gap: Spacing.two,
    paddingRight: Spacing.four,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  topRow: {
    gap: Spacing.three,
  },
  // Contadores a la derecha y banner a la izquierda cuando hay espacio.
  topRowWide: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  statsColumn: {
    flexDirection: 'column',
    flex: 1,
    minWidth: 220,
  },
  heroWide: {
    flex: 2,
    flexDirection: 'row',
  },
  heroMain: {
    flex: 1,
    flexDirection: 'row',
  },
  heroImageSide: {
    width: 300,
    alignSelf: 'stretch',
  },
  heroImageTop: {
    width: '100%',
    height: 130,
  },
  projectCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  projectImage: {
    width: '100%',
    height: 150,
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gameStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,13,16,0.78)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  gameStripText: {
    color: '#E6EAF0',
    letterSpacing: 0.5,
  },
  projectCardContent: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  projectTitle: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
  rule: {
    height: 1,
    marginVertical: Spacing.one,
  },
  emptyProjects: {
    padding: Spacing.three,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: Spacing.one,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  quickCard: {
    flex: 1,
    minWidth: 145,
    minHeight: 120,
    padding: Spacing.three,
    borderRadius: 10,
    borderWidth: 1,
    gap: Spacing.two,
  },
  quickMark: {
    width: 20,
    height: 4,
    borderRadius: 1,
  },
  loading: {
    minHeight: 240,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.three,
  },
  errorText: {
    color: '#C73535',
  },
  pressed: {
    opacity: 0.7,
  },
});
