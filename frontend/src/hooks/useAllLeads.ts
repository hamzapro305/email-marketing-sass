import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';

const PAGE_SIZE = 200;

/**
 * Loads the session's leads (across campaigns) one server page at a time, so
 * the Leads view stays fast at 10k+ leads. Auto-refreshes while any loaded
 * lead is mid-pipeline.
 */
export function useAllLeads() {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: qk.leads(page),
    queryFn: () => api.listLeads({ page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.items.some((l) =>
        ['queued', 'researching', 'analyzing', 'writing', 'sending'].includes(
          l.status,
        ),
      )
        ? 3_000
        : false,
  });

  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return {
    leads: data?.items ?? [],
    total: data?.total ?? 0,
    page,
    totalPages,
    setPage,
    loading: query.isPending,
    error: query.error ? errMessage(query.error, 'Failed to load leads') : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
