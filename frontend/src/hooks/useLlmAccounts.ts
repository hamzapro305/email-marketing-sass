import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LlmAccount } from '../api/types';

/**
 * Loads the session's LLM providers (AI writer). When none are configured the
 * writer falls back to a built-in template writer, so this doesn't gate sending
 * — it just tells the UI which model will write emails.
 */
export function useLlmAccounts() {
  const [accounts, setAccounts] = useState<LlmAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await api.listLlmAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load LLM providers');
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
