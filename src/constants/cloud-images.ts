/**
 * Fotos de la nube (Unsplash, licencia de uso libre) para banners y portadas.
 * Si alguna no carga, `CloudImage` muestra la imagen local `img/boardgames.png`.
 */
const unsplash = (photoId: string, width = 1400) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${width}&q=70`;

export const CloudImages = {
  /** Gente jugando: banner de Inicio. */
  home: unsplash('1761716475708-ef98183ccb62'),
  /** Mesa con cartas y fichas: Tablón. */
  board: unsplash('1763875018525-1d39fe1a4354'),
  /** Estantería de juegos: Mis juegos. */
  library: unsplash('1769288361820-898812b71482'),
  /** Dos personas jugando: Mensajes. */
  messages: unsplash('1677188010559-0667a1ed33a0'),
  /** Dados: Perfil. */
  profile: unsplash('1547638375-ebf04735d792'),
  /** Fichas y dados: panel del chat vacío. */
  chat: unsplash('1629760946220-5693ee4c46ac', 900),
} as const;

/** Portadas de reserva para mesas sin imagen propia ni portada de juego. */
const CARD_FALLBACKS = [
  unsplash('1762068383426-2e4389df451c', 800),
  unsplash('1763875067516-e947790c74ac', 800),
  unsplash('1629760946220-5693ee4c46ac', 800),
  unsplash('1611996575749-79a3a250f948', 800),
  unsplash('1763875018525-1d39fe1a4354', 800),
];

/** Elige siempre la misma foto para un mismo identificador. */
export function pickCardFallback(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return CARD_FALLBACKS[hash % CARD_FALLBACKS.length];
}
