import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Campaign } from '../api/types';

/** Loads the session's campaigns for the list page. */
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setCampaigns(await api.listCampaigns());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { campaigns, setCampaigns, loading, error, refresh };
}
