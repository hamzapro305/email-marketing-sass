import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/** Loads every lead in the session (across campaigns) for the Leads page. */
export function useAllLeads() {
  const query = useQuery({
    queryKey: qk.leads,
    queryFn: () => api.listLeads(),
  });

  return {
    leads: query.data ?? [],
    loading: query.isPending,
    error: query.error ? errMessage(query.error, 'Failed to load leads') : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
