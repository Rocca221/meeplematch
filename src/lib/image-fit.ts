import { Platform } from 'react-native';

/** Proporción y ancho con los que se guardan las imágenes de las mesas. */
export const PROJECT_IMAGE_RATIO = 16 / 9;
export const PROJECT_IMAGE_WIDTH = 1280;

function loadImage(uri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = document.createElement('img');
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    image.src = uri;
  });
}

/**
 * Ajusta automáticamente la imagen elegida: la recorta al centro en 16:9, la
 * reduce a un máximo de 1280 px de ancho y la guarda como JPG, para que no
 * se vea estirada ni aplastada en las tarjetas.
 *
 * En web hace el recorte aquí; en el celular el selector ya recorta en 16:9
 * (`allowsEditing` con `aspect`), así que devuelve la misma URI.
 */
export async function fitImageTo16x9(uri: string): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return uri;

  const image = await loadImage(uri);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) return uri;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceWidth / sourceHeight > PROJECT_IMAGE_RATIO) {
    cropWidth = Math.round(sourceHeight * PROJECT_IMAGE_RATIO);
  } else {
    cropHeight = Math.round(sourceWidth / PROJECT_IMAGE_RATIO);
  }
  const cropX = Math.round((sourceWidth - cropWidth) / 2);
  const cropY = Math.round((sourceHeight - cropHeight) / 2);

  const outputWidth = Math.min(PROJECT_IMAGE_WIDTH, cropWidth);
  const outputHeight = Math.round(outputWidth / PROJECT_IMAGE_RATIO);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) return uri;

  // Fondo blanco para que un PNG con transparencia no quede negro en el JPG.
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  return blob ? URL.createObjectURL(blob) : uri;
}
