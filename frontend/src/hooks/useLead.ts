import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Lead } from '../api/types';

/** Loads a single lead (with its campaign name) for the lead detail page. */
export function useLead(id: string) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLead(await api.getLead(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load lead');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { lead, loading, error, refresh };
}
