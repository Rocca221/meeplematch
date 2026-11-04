import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';

import { useAccessibility } from '@/providers/accessibility-provider';

const localFallback = require('../../img/boardgames.png');

type CloudImageProps = Omit<ImageProps, 'source'> & {
  uri: string;
  /**
   * Texto alternativo. Si se omite la imagen se considera decorativa y los
   * lectores de pantalla la ignoran.
   */
  alt?: string;
};

/** Imagen remota que cae a la portada local si no se puede descargar. */
export function CloudImage({ uri, alt, ...rest }: CloudImageProps) {
  // Se guarda qué URL falló, así cambiar de imagen reinicia solo.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = failedUri === uri;
  const { effective } = useAccessibility();

  return (
    <Image
      source={failed ? localFallback : { uri }}
      contentFit="cover"
      transition={effective.reduceMotion ? 0 : 250}
      onError={() => setFailedUri(uri)}
      alt={alt ?? ''}
      accessible={Boolean(alt)}
      accessibilityLabel={alt}
      {...rest}
    />
  );
}
