import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusMessage } from '@/components/status-message';
import { SelectedMark } from '@/components/choice';
import { Pressable } from '@/components/accessible-pressable';
import { AccessibilityCenter } from '@/components/accessibility-center';
import { LocalizedTextInput } from '@/components/localized-text-input';
import { PageBanner } from '@/components/page-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CloudImages } from '@/constants/cloud-images';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccessibility } from '@/providers/accessibility-provider';
import { useTopInset } from '@/hooks/use-top-inset';
import {
  useLocationSuggestions,
  type LocationSuggestion,
} from '@/hooks/use-location-suggestions';
import { supabase } from '@/lib/supabase';
import { registerPushToken } from '@/lib/register-push-token';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage, type AppLanguage } from '@/providers/language-provider';
import {
  useThemePreference,
  type ThemePreference,
} from '@/providers/theme-preference-provider';

const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Estoy empezando' },
  { value: 'casual', label: 'Casual' },
  { value: 'experienced', label: 'Con experiencia' },
  { value: 'expert', label: 'Experto/a' },
] as const;

const GAME_TYPE_OPTIONS = [
  { value: 'party', label: 'Party' },
  { value: 'rol', label: 'Rol' },
  { value: 'wargame', label: 'Wargame' },
  { value: 'euro', label: 'Euro' },
  { value: 'push your luck', label: 'Push your luck' },
  { value: 'estrategia', label: 'Estrategia' },
  { value: 'cooperativo', label: 'Cooperativo' },
  { value: 'familiar', label: 'Familiar' },
  { value: 'abstracto', label: 'Abstracto' },
  { value: 'narrativo', label: 'Narrativo' },
  { value: 'deducción', label: 'Deducción' },
  { value: 'cartas', label: 'Cartas' },
  { value: 'deckbuilding', label: 'Deckbuilding' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'colocación de trabajadores', label: 'Colocación de trabajadores' },
  { value: 'control de áreas', label: 'Control de áreas' },
  { value: 'filler', label: 'Filler' },
] as const;

type ProfileForm = {
  display_name: string;
  bio: string;
  city: string;
  experience_level: (typeof EXPERIENCE_LEVELS)[number]['value'];
  preferred_game_types: string[];
};

function normalizeGameType(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isPresetGameType(value: string) {
  return GAME_TYPE_OPTIONS.some(
    (option) => normalizeGameType(option.value) === normalizeGameType(value),
  );
}

export default function ProfileScreen() {
  const { session } = useAuth();
  const {
    language,
    setLanguage,
    translate,
    storageError: languageStorageError,
  } =
    useLanguage();
  const theme = useTheme();
  const topInset = useTopInset();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { effective } = useAccessibility();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [a11yY, setA11yY] = useState<number | null>(null);
  const {
    preference,
    setPreference,
    storageError: themeStorageError,
  } = useThemePreference();
  const userId = session?.user.id;
  const accent = theme.accent;
  const border = theme.border;
  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [registeringPush, setRegisteringPush] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [newGameType, setNewGameType] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const {
    suggestions: locationSuggestions,
    loading: loadingLocations,
    error: locationSearchError,
  } = useLocationSuggestions(locationQuery, language);
  const [selectedCoordinates, setSelectedCoordinates] =
    useState<[number, number] | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setError('');

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select(
        'display_name, bio, city, avatar_url, experience_level, preferred_game_types',
      )
      .eq('id', userId)
      .single();

    if (profileError) {
      setError(profileError.message);
      return;
    }

    setProfile({
      display_name: data.display_name ?? '',
      bio: data.bio ?? '',
      city: data.city ?? '',
      experience_level: data.experience_level ?? 'beginner',
      preferred_game_types: data.preferred_game_types ?? [],
    });
    setAvatarUrl(data.avatar_url);
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      setLoading(true);
      await loadProfile();
      if (active) setLoading(false);
    }

    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadProfile]);

  function updateField<Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key],
  ) {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
    setMessage('');
  }

  function chooseLocation(suggestion: LocationSuggestion) {
    updateField('city', suggestion.label);
    setSelectedCoordinates(suggestion.coordinates);
    setLocationQuery('');
  }

  async function openLocationInMaps() {
    const query = selectedCoordinates
      ? `${selectedCoordinates[1]},${selectedCoordinates[0]}`
      : profile?.city.trim();
    if (!query) {
      setError(
        language === 'en'
          ? 'Choose or enter a location first.'
          : 'Elige o escribe una ubicación primero.',
      );
      return;
    }

    try {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      await Linking.openURL(url);
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : language === 'en'
            ? 'Could not open Google Maps.'
            : 'No se pudo abrir Google Maps.',
      );
    }
  }

  function toggleGameType(value: string) {
    setProfile((current) => {
      if (!current) return current;
      const selected = current.preferred_game_types.some(
        (item) => normalizeGameType(item) === normalizeGameType(value),
      );
      return {
        ...current,
        preferred_game_types: selected
          ? current.preferred_game_types.filter(
              (item) => normalizeGameType(item) !== normalizeGameType(value),
            )
          : [...current.preferred_game_types, value],
      };
    });
    setMessage('');
  }

  function addCustomGameTypes() {
    const additions = newGameType
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!additions.length) return;

    setProfile((current) => {
      if (!current) return current;
      const selected = new Set(
        current.preferred_game_types.map(normalizeGameType),
      );
      return {
        ...current,
        preferred_game_types: [
          ...current.preferred_game_types,
          ...additions.filter((value) => {
            const normalized = normalizeGameType(value);
            if (selected.has(normalized)) return false;
            selected.add(normalized);
            return true;
          }),
        ],
      };
    });
    setNewGameType('');
    setMessage('');
  }

  async function saveProfile() {
    if (!userId || !profile) return;
    const displayName = profile.display_name.trim();
    if (!displayName) {
      setError('El nombre visible no puede quedar vacío.');
      return;
    }
    if (displayName.length > 80) {
      setError('El nombre visible puede tener hasta 80 caracteres.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');

    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        bio: profile.bio.trim(),
        city: profile.city.trim() || null,
        experience_level: profile.experience_level,
        preferred_game_types: profile.preferred_game_types.slice(0, 30),
      })
      .eq('id', userId);

    if (saveError) {
      setError(saveError.message);
    } else {
      setProfile((current) =>
        current ? { ...current, display_name: displayName } : current,
      );
      setMessage('Perfil guardado correctamente.');
    }
    setSaving(false);
  }

  async function changeAvatar() {
    if (!userId) return;
    setError('');
    setMessage('');

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        throw new Error('La foto debe pesar menos de 8 MB.');
      }
      const contentType = asset.mimeType ?? 'image/jpeg';
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)
      ) {
        throw new Error('Elige una imagen JPG, PNG o WebP.');
      }

      setUploadingAvatar(true);
      const imageResponse = await fetch(asset.uri);
      if (!imageResponse.ok) {
        throw new Error('No se pudo leer la foto seleccionada.');
      }
      const imageBlob = await imageResponse.blob();
      if (imageBlob.size > 8 * 1024 * 1024) {
        throw new Error('La foto debe pesar menos de 8 MB.');
      }
      const imagePath = `${userId}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(imagePath, imageBlob, {
          contentType,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage
        .from('avatars')
        .getPublicUrl(imagePath).data.publicUrl;
      const nextAvatarUrl = `${publicUrl}?v=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: nextAvatarUrl })
        .eq('id', userId);
      if (updateError) throw updateError;

      setAvatarUrl(nextAvatarUrl);
      setMessage('Foto de perfil actualizada.');
    } catch (avatarError) {
      setError(
        avatarError instanceof Error
          ? avatarError.message
          : 'No se pudo actualizar la foto de perfil.',
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function enablePushNotifications() {
    if (!userId) return;
    setRegisteringPush(true);
    setPushMessage('');
    setError('');

    try {
      await registerPushToken(userId);
      setPushMessage('Notificaciones push activadas en este dispositivo.');
    } catch (pushError) {
      setPushMessage(
        pushError instanceof Error
          ? pushError.message
          : 'No se pudieron activar las notificaciones.',
      );
    } finally {
      setRegisteringPush(false);
    }
  }

  useEffect(() => {
    if (section === 'accessibility' && a11yY !== null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, a11yY - 16), animated: !effective.reduceMotion });
    }
  }, [section, a11yY, effective.reduceMotion]);

  async function chooseTheme(nextPreference: ThemePreference) {
    setError('');
    try {
      await setPreference(nextPreference);
    } catch (themeError) {
      setError(
        themeError instanceof Error
          ? `No se pudo guardar el tema: ${themeError.message}`
          : 'No se pudo guardar la preferencia de tema.',
      );
    }
  }

  async function chooseLanguage(nextLanguage: AppLanguage) {
    setError('');
    try {
      await setLanguage(nextLanguage);
    } catch (languageError) {
      setError(
        languageError instanceof Error
          ? languageError.message
          : language === 'en'
            ? 'Could not save the language preference.'
            : 'No se pudo guardar la preferencia de idioma.',
      );
    }
  }

  async function signOut() {
    setSigningOut(true);
    setError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : language === 'en'
            ? 'Could not sign out.'
            : 'No se pudo cerrar la sesión.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.loadingScreen}>
        <ActivityIndicator accessibilityLabel="Cargando" size="large" color={accent} />
        <ThemedText themeColor="textSecondary">Cargando perfil...</ThemedText>
      </ThemedView>
    );
  }

  if (!profile) {
    return (
      <ThemedView style={styles.loadingScreen}>
        <StatusMessage kind="error">{error || 'No se pudo cargar tu perfil.'}</StatusMessage>
        <Pressable onPress={() => void loadProfile()}>
          <ThemedText style={{ color: accent }}>Reintentar</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingTop: Spacing.four + topInset }]}>
          <PageBanner image={CloudImages.profile} />

          <View style={styles.header}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              TU IDENTIDAD COMO JUGADOR
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Mi perfil
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Comparte tus gustos para encontrar tu mesa ideal.
            </ThemedText>
            <Pressable
              accessibilityLabel="Ir a los ajustes de accesibilidad"
              onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, (a11yY ?? 0) - 16), animated: !effective.reduceMotion })}
              style={[styles.a11yLink, { borderColor: border }]}>
              <ThemedText type="smallBold" style={{ color: accent }}>
                Aa
              </ThemedText>
              <ThemedText type="smallBold">Ajustes de accesibilidad ↓</ThemedText>
            </Pressable>
          </View>

          <ThemedView type="backgroundElement" style={styles.identityCard}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                contentFit="cover"
                style={styles.avatar}
                accessibilityLabel="Foto de perfil"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: theme.accentFill }]}>
                <ThemedText style={styles.avatarText}>
                  {profile.display_name.slice(0, 1).toUpperCase() || 'M'}
                </ThemedText>
              </View>
            )}
            <View style={styles.identityCopy}>
              <ThemedText type="subtitle" style={styles.identityName}>
                {profile.display_name || 'Jugador MeepleMatch'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {session?.user.email}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={uploadingAvatar}
              onPress={() => void changeAvatar()}
              style={[styles.secondaryButton, { borderColor: border }]}>
              <ThemedText type="smallBold" style={{ color: accent }}>
                {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.formCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Perfil lúdico
            </ThemedText>
            <Field
              label="Nombre visible"
              value={profile.display_name}
              placeholder="Nombre de jugador"
              onChangeText={(value) => updateField('display_name', value)}
              borderColor={border}
              textColor={theme.text}
            />
            <Field
              label="Sobre mí"
              value={profile.bio}
              placeholder="¿Qué buscas en una mesa de juego?"
              onChangeText={(value) => updateField('bio', value)}
              borderColor={border}
              textColor={theme.text}
              multiline
            />
            <View style={styles.field}>
              <ThemedText type="smallBold">Ciudad o zona</ThemedText>
              <LocalizedTextInput
                value={profile.city}
                onChangeText={(value) => {
                  updateField('city', value);
                  setLocationQuery(value);
                  setSelectedCoordinates(null);
                }}
                placeholder="Ej. Buenos Aires"
                placeholderTextColor="#858995"
                style={[styles.input, { borderColor: border, color: theme.text }]}
              />
              {locationQuery.trim().length < 3 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Escribe al menos 3 caracteres para ver sugerencias.
                </ThemedText>
              ) : null}
              {loadingLocations ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Buscando ubicaciones...
                </ThemedText>
              ) : null}
              {locationSearchError ? (
                <StatusMessage kind="error">{locationSearchError}</StatusMessage>
              ) : null}
              {locationSuggestions.map((suggestion) => (
                <Pressable
                  key={`${suggestion.label}:${suggestion.coordinates.join(',')}`}
                  accessibilityRole="button"
                  onPress={() => chooseLocation(suggestion)}
                  style={[styles.locationSuggestion, { borderColor: border }]}>
                  <ThemedText type="smallBold">{suggestion.label}</ThemedText>
                </Pressable>
              ))}
              {locationQuery.trim().length >= 3 &&
              !loadingLocations &&
              !locationSearchError &&
              !locationSuggestions.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No se encontraron ubicaciones. Prueba con otro nombre.
                </ThemedText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!profile.city.trim()}
                onPress={() => void openLocationInMaps()}
                style={[
                  styles.secondaryButton,
                  { borderColor: border },
                  !profile.city.trim() && styles.disabled,
                ]}>
                <ThemedText type="smallBold" style={{ color: accent }}>
                  Abrir en Google Maps
                </ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">
                Sugerencias de OpenStreetMap · © OpenStreetMap contributors
              </ThemedText>
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">Experiencia</ThemedText>
              <View style={styles.optionList}>
                {EXPERIENCE_LEVELS.map((level) => {
                  const selected = profile.experience_level === level.value;
                  return (
                    <Pressable
                      key={level.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => updateField('experience_level', level.value)}
                      style={[
                        styles.option,
                        {
                          borderColor: selected ? accent : border,
                          backgroundColor: selected
                            ? theme.accentSoft
                            : 'transparent',
                        },
                      ]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<SelectedMark selected={selected} />
<ThemedText type="smallBold" style={selected ? { color: accent } : undefined}>{level.label}</ThemedText>
</View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <ThemedText type="smallBold">Estilos de juego que prefieres</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Selecciona los que te representan. También puedes agregar uno propio.
              </ThemedText>
              <View style={styles.optionList}>
                {GAME_TYPE_OPTIONS.map((option) => {
                  const selected = profile.preferred_game_types.some(
                    (value) =>
                      normalizeGameType(value) === normalizeGameType(option.value),
                  );
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => toggleGameType(option.value)}
                      style={[
                        styles.option,
                        {
                          borderColor: selected ? accent : border,
                          backgroundColor: selected
                            ? theme.accentSoft
                            : 'transparent',
                        },
                      ]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<SelectedMark selected={selected} />
<ThemedText type="smallBold" style={selected ? { color: accent } : undefined}>{translate(option.label)}</ThemedText>
</View>
                    </Pressable>
                  );
                })}
              </View>
              {profile.preferred_game_types.some((value) => !isPresetGameType(value)) ? (
                <View style={styles.optionList}>
                  {profile.preferred_game_types
                    .filter((value) => !isPresetGameType(value))
                    .map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar estilo ${value}`}
                        onPress={() => toggleGameType(value)}
                        style={[styles.option, { borderColor: accent }]}>
                        <ThemedText type="smallBold" style={{ color: accent }}>
                          {value} ×
                        </ThemedText>
                      </Pressable>
                    ))}
                </View>
              ) : null}
              <View style={styles.customTypeRow}>
                <LocalizedTextInput
                  value={newGameType}
                  onChangeText={setNewGameType}
                  placeholder="Otro estilo (puedes separar con comas)"
                  placeholderTextColor="#858995"
                  onSubmitEditing={addCustomGameTypes}
                  returnKeyType="done"
                  style={[
                    styles.input,
                    styles.customTypeInput,
                    { color: theme.text, borderColor: border },
                  ]}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!newGameType.trim()}
                  onPress={addCustomGameTypes}
                  style={[
                    styles.secondaryButton,
                    { borderColor: border },
                    !newGameType.trim() && styles.disabled,
                  ]}>
                  <ThemedText type="smallBold" style={{ color: accent }}>
                    Agregar
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.formCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Idioma
            </ThemedText>
            <View style={styles.optionList}>
              {(
                [
                  ['es', 'Español'],
                  ['en', 'English'],
                ] as const
              ).map(([value, label]) => {
                const selected = language === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => void chooseLanguage(value)}
                    style={[
                      styles.option,
                      {
                        borderColor: selected ? accent : border,
                        backgroundColor: selected
                          ? theme.accentSoft
                          : 'transparent',
                      },
                    ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<SelectedMark selected={selected} />
<ThemedText type="smallBold" style={selected ? { color: accent } : undefined}>{label}</ThemedText>
</View>
                  </Pressable>
                );
              })}
            </View>
            {languageStorageError ? (
              <StatusMessage kind="error">{languageStorageError}</StatusMessage>
            ) : null}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.formCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Apariencia
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Elige cómo se verá MeepleMatch en este dispositivo.
            </ThemedText>
            <View style={styles.optionList}>
              {(
                [
                  ['system', 'Seguir el dispositivo'],
                  ['light', 'Tema claro'],
                  ['dark', 'Tema oscuro'],
                ] as const
              ).map(([value, label]) => {
                const selected = preference === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => void chooseTheme(value)}
                    style={[
                      styles.option,
                      {
                        borderColor: selected ? accent : border,
                        backgroundColor: selected
                          ? theme.accentSoft
                          : 'transparent',
                      },
                    ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
<SelectedMark selected={selected} />
<ThemedText type="smallBold" style={selected ? { color: accent } : undefined}>{label}</ThemedText>
</View>
                  </Pressable>
                );
              })}
            </View>
            {themeStorageError ? (
              <StatusMessage kind="error">{themeStorageError}</StatusMessage>
            ) : null}
          </ThemedView>

          <ThemedView
            type="backgroundElement"
            style={styles.formCard}
            onLayout={(event) => setA11yY(event.nativeEvent.layout.y)}>
            <AccessibilityCenter />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.formCard}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Notificaciones
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Recibe avisos cuando llegue un mensaje nuevo.
            </ThemedText>
            {pushMessage ? (
              <StatusMessage
                kind={pushMessage.startsWith('Notificaciones') ? 'success' : 'error'}>
                {pushMessage}
              </StatusMessage>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={registeringPush}
              onPress={() => void enablePushNotifications()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: theme.accentFill },
                (pressed || registeringPush) && styles.disabled,
              ]}>
              <ThemedText style={styles.saveText}>
                {registeringPush ? 'Activando...' : 'Activar notificaciones'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          {error ? <StatusMessage kind="error">{error}</StatusMessage> : null}
          {message ? <StatusMessage kind="success">{message}</StatusMessage> : null}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void saveProfile()}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: theme.accentFill },
              (pressed || saving) && styles.disabled,
            ]}>
            <ThemedText style={styles.saveText}>
              {saving ? 'Guardando...' : 'Guardar perfil'}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={signingOut}
            onPress={() => void signOut()}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: border },
              (pressed || signingOut) && styles.disabled,
            ]}>
            <ThemedText type="smallBold" style={{ color: accent }}>
              {signingOut ? 'Saliendo...' : 'Cerrar sesión'}
            </ThemedText>
          </Pressable>
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
  multiline = false,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  placeholder: string;
  helper?: string;
  onChangeText: (value: string) => void;
  borderColor: string;
  textColor: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <LocalizedTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#858995"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        autoCapitalize={autoCapitalize}
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
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 18,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  identityCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  secondaryButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityName: {
    fontSize: 21,
    lineHeight: 28,
  },
  formCard: {
    padding: Spacing.three,
    borderRadius: 18,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 29,
  },
  field: {
    gap: Spacing.one,
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
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  locationSuggestion: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  customTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  customTypeInput: {
    flex: 1,
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.65,
  },
  a11yLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.one,
  },
  error: {
    color: '#C73535',
  },
  success: {
    color: '#20834A',
  },
});
