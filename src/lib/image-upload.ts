/**
 * Lectura de imágenes para subirlas a Supabase Storage.
 *
 * En el celular, `response.blob()` suele devolver un tipo vacío o `text/plain`, y
 * supabase-js usa ese tipo (no el `contentType` indicado) al subir un Blob. Por
 * eso se sube un ArrayBuffer con el tipo MIME explícito.
 */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function typeFromUri(uri: string) {
  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

export async function readImageForUpload(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('No se pudo leer la imagen seleccionada.');
  const buffer = await response.arrayBuffer();

  const headerType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  const contentType =
    typeFromUri(uri) ?? (ALLOWED_TYPES.includes(headerType) ? headerType : 'image/jpeg');
  return { buffer, contentType };
}
