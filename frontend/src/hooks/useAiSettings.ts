import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AiSettings } from '../api/types';

/** Loads the session's AI email-writing settings for the Settings page. */
export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await api.getAiSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { settings, setSettings, loading, error, refresh };
}
