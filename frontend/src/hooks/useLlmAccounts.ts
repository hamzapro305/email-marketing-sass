import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/**
 * Loads the session's LLM providers (AI writer). When none are configured the
 * writer falls back to a built-in template writer, so this doesn't gate sending
 * — it just tells the UI which model will write emails.
 */
export function useLlmAccounts() {
  const query = useQuery({
    queryKey: qk.llmAccounts,
    queryFn: () => api.listLlmAccounts(),
  });

  const accounts = query.data ?? [];
  return {
    accounts,
    hasAny: accounts.length > 0,
    loading: query.isPending,
    error: query.error
      ? errMessage(query.error, 'Failed to load LLM providers')
      : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
