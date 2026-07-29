import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

/**
 * Loads the session's SMTP sending accounts. `hasAny` gates sending across the
 * app — campaigns can't be started until at least one account exists.
 */
export function useSmtpAccounts() {
  const query = useQuery({
    queryKey: qk.smtpAccounts,
    queryFn: () => api.listSmtpAccounts(),
  });

  const accounts = query.data ?? [];
  return {
    accounts,
    hasAny: accounts.length > 0,
    loading: query.isPending,
    error: query.error
      ? errMessage(query.error, 'Failed to load SMTP accounts')
      : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
