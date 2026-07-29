import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/** Loads the session's AI email-writing settings for the Settings page. */
export function useAiSettings() {
  const query = useQuery({
    queryKey: qk.aiSettings,
    queryFn: () => api.getAiSettings(),
  });

  return {
    settings: query.data ?? null,
    loading: query.isPending,
    error: query.error ? errMessage(query.error, 'Failed to load settings') : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
