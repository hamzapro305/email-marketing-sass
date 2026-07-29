import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/** Loads the session's campaigns for the list page. */
export function useCampaigns() {
  const query = useQuery({
    queryKey: qk.campaigns,
    queryFn: () => api.listCampaigns(),
  });

  return {
    campaigns: query.data ?? [],
    loading: query.isPending,
    error: query.error ? errMessage(query.error, 'Failed to load campaigns') : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
