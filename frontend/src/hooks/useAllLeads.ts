import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Lead } from '../api/types';

/** Loads every lead in the session (across campaigns) for the Leads page. */
export function useAllLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setLeads(await api.listLeads());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { leads, loading, error, refresh };
}
