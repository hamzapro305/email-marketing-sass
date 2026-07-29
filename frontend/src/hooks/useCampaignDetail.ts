import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { errMessage, qk } from '../api/query';
import type { Campaign, Lead } from '../api/types';

const POLL_INTERVAL_MS = 1500;

/**
 * Loads a single campaign with its files and leads. While the campaign is
 * `running` React Query polls so per-lead status and counters update live —
 * this keeps working even though the backend processes the queue independently.
 */
export function useCampaignDetail(id: string) {
  // Campaign + its leads travel together and drive the live-polling loop.
  const main = useQuery({
    queryKey: qk.campaign(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<{ campaign: Campaign; leads: Lead[] }> => {
      const [campaign, leads] = await Promise.all([
        api.getCampaign(id),
        api.getCampaignLeads(id),
      ]);
      return { campaign, leads };
    },
    // Poll only while the campaign is actively sending; stop once it settles.
    refetchInterval: (query) =>
      query.state.data?.campaign.status === 'running' ? POLL_INTERVAL_MS : false,
  });

  const filesQuery = useQuery({
    queryKey: qk.campaignFiles(id),
    enabled: Boolean(id),
    queryFn: () => api.listCampaignFiles(id),
  });

  const refresh = useCallback(async () => {
    await Promise.all([main.refetch(), filesQuery.refetch()]);
  }, [main, filesQuery]);

  const refreshFiles = useCallback(async () => {
    await filesQuery.refetch();
  }, [filesQuery]);

  // With status-driven `refetchInterval`, an explicit start just needs one
  // refetch to pick up the new `running` status; polling then continues on its
  // own until the campaign finishes.
  const startPolling = useCallback(() => {
    void main.refetch();
  }, [main]);

  return {
    campaign: main.data?.campaign ?? null,
    leads: main.data?.leads ?? [],
    files: filesQuery.data ?? [],
    loading: main.isPending,
    error: main.error ? errMessage(main.error, 'Failed to load campaign') : null,
    refresh,
    refreshFiles,
    startPolling,
  };
}
