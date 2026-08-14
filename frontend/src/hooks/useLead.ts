import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';
import { ACTIVE_LEAD_STATUSES } from '../api/types';

/**
 * Loads a single lead (with its campaign name) for the lead detail page.
 * Polls while the lead is moving through the pipeline so the page is live.
 */
export function useLead(id: string) {
  const query = useQuery({
    queryKey: qk.lead(id),
    queryFn: () => api.getLead(id),
    enabled: Boolean(id),
    refetchInterval: (q) =>
      q.state.data && ACTIVE_LEAD_STATUSES.includes(q.state.data.status)
        ? 2_500
        : false,
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
