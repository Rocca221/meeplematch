import { useEffect, useState } from 'react';

import type { AppLanguage } from '@/providers/language-provider';

export type LocationSuggestion = {
  label: string;
  coordinates: [number, number];
};

type PhotonResponse = {
  features: {
    properties: {
      name?: string;
      city?: string;
      state?: string;
      country?: string;
    };
    geometry: {
      coordinates: [number, number];
    };
  }[];
};

export function useLocationSuggestions(query: string, language: AppLanguage) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = query.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (search.length < 3) {
        setSuggestions([]);
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      void (async () => {
        try {
          const response = await fetch(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(search)}&limit=5&lang=${language === 'en' ? 'en' : 'default'}`,
            { signal: controller.signal },
          );
          if (!response.ok) {
            throw new Error(
              language === 'en'
                ? `The location service responded with ${response.status}.`
                : `El servicio de ubicaciones respondió ${response.status}.`,
            );
          }

          const result = (await response.json()) as PhotonResponse;
          if (controller.signal.aborted) return;

          setSuggestions(
            result.features
              .map(({ properties, geometry }) => ({
                label: [
                  properties.name,
                  properties.city,
                  properties.state,
                  properties.country,
                ]
                  .filter((value, index, values): value is string =>
                    Boolean(value) && values.indexOf(value) === index,
                  )
                  .join(', '),
                coordinates: geometry.coordinates,
              }))
              .filter((suggestion) => suggestion.label.length > 0),
          );
        } catch (searchError) {
          if (controller.signal.aborted) return;
          setError(
            searchError instanceof Error
              ? searchError.message
              : language === 'en'
                ? 'Could not search for locations.'
                : 'No se pudieron buscar ubicaciones.',
          );
          setSuggestions([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, 450);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [language, query]);

  return { suggestions, loading, error };
}
