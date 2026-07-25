import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SmtpAccount } from '../api/types';

/**
 * Loads the session's SMTP sending accounts. `hasAny` gates sending across the
 * app — campaigns can't be started until at least one account exists.
 */
export function useSmtpAccounts() {
  const [accounts, setAccounts] = useState<SmtpAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await api.listSmtpAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load SMTP accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    accounts,
    hasAny: accounts.length > 0,
    loading,
    error,
    refresh,
  };
}
