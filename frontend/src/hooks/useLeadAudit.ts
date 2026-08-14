import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/**
 * Loads a lead's structured audit and exposes a "run audit" action.
 * Polls while the pipeline is running so every stage lights up live.
 * A 404 simply means no audit has been run yet — surfaced as `audit: null`.
 */
export function useLeadAudit(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.leadAudit(id),
    queryFn: async () => {
      try {
        return await api.getLeadAudit(id);
      } catch (err) {
        if (err instanceof Error && /no audit/i.test(err.message)) return null;
        throw err;
      }
    },
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 2_500 : false),
  });

  const runMutation = useMutation({
    mutationFn: () => api.runLeadAudit(id),
    onSuccess: () => {
      toast.success('Audit started', {
        description: 'Researching the company, rivals, and opportunities…',
      });
      void queryClient.invalidateQueries({ queryKey: qk.lead(id) });
      void queryClient.invalidateQueries({ queryKey: qk.leadAudit(id) });
    },
    onError: (err) => {
      toast.error('Could not start the audit', {
        description: errMessage(err, 'Unknown error'),
      });
    },
  });

  return {
    audit: query.data ?? null,
    loading: query.isPending,
    error: query.error ? errMessage(query.error, 'Failed to load audit') : null,
    runAudit: () => runMutation.mutate(),
    running: runMutation.isPending || query.data?.status === 'running',
  };
}
