import { supabase } from '@/lib/supabase';

/**
 * URL pública de la portada de un juego. `cover_path` puede ser una ruta
 * dentro del bucket `game-covers` o una URL https completa (fotos de la nube).
 */
export function gameCoverUrl(coverPath: string | null | undefined): string | null {
  const path = coverPath?.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from('game-covers').getPublicUrl(path).data.publicUrl;
}
