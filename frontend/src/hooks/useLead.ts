import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/** Loads a single lead (with its campaign name) for the lead detail page. */
export function useLead(id: string) {
  const query = useQuery({
    queryKey: qk.lead(id),
    queryFn: () => api.getLead(id),
    enabled: Boolean(id),
  });

  return {
    lead: query.data ?? null,
    loading: query.isPending,
    error: query.error ? errMessage(query.error, 'Failed to load lead') : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
