/**
 * Cercanía entre la ciudad/zona del perfil y la ubicación de una publicación.
 *
 * El esquema no guarda coordenadas, así que se compara el texto. Las
 * ubicaciones que sugiere Photon tienen la forma
 * "Nombre, Ciudad, Provincia, País"; se separan por comas y se comparan por
 * tramos (sin tildes ni mayúsculas) en lugar de exigir que un texto contenga
 * al otro completo.
 */

export type NearbyTier = 'city' | 'area' | 'none';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Tramos normalizados, sin el país (último tramo) cuando hay más de uno. */
function localParts(value: string) {
  const parts = value
    .split(',')
    .map(normalize)
    .filter((part) => part.length > 0);
  return parts.length > 1 ? parts.slice(0, -1) : parts;
}

/**
 * - `city`: la ciudad/barrio principal del perfil aparece en la publicación.
 * - `area`: comparten provincia/zona, pero no la ciudad exacta.
 * - `none`: no hay coincidencia (compartir solo el país no cuenta).
 */
export function getNearbyTier(
  projectLocation: string | null,
  profileCity: string | null,
): NearbyTier {
  if (!projectLocation || !profileCity) return 'none';

  const project = localParts(projectLocation);
  const city = localParts(profileCity);
  if (!project.length || !city.length) return 'none';

  if (project.includes(city[0])) return 'city';
  if (city.some((part) => project.includes(part))) return 'area';

  // Respaldo para variantes como "Ciudad de Córdoba" frente a "Córdoba".
  const projectFull = project.join(' ');
  const cityFull = city.join(' ');
  if (projectFull.includes(cityFull) || cityFull.includes(projectFull)) {
    return 'area';
  }

  return 'none';
}

const TIER_RANK: Record<NearbyTier, number> = { city: 2, area: 1, none: 0 };

export function compareNearby(
  left: { tier: NearbyTier; created_at: string },
  right: { tier: NearbyTier; created_at: string },
) {
  const byTier = TIER_RANK[right.tier] - TIER_RANK[left.tier];
  if (byTier !== 0) return byTier;
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

export function formatAge(createdAt: string, language: 'es' | 'en') {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(createdAt).getTime()) / 60000),
  );
  if (minutes < 60) {
    return language === 'en' ? 'Just now' : 'Recién publicado';
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return language === 'en' ? `${hours}h ago` : `Hace ${hours} h`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return language === 'en'
      ? `${days} day${days === 1 ? '' : 's'} ago`
      : `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  const months = Math.round(days / 30);
  return language === 'en'
    ? `${months} mo ago`
    : `Hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}
