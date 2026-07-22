import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Campaign, Lead } from '../api/types';

const POLL_INTERVAL_MS = 1500;

/**
 * Tracks a running campaign: polls `/campaigns/:id` and `/campaigns/:id/leads`
 * every ~1.5s while the campaign status is `running`, and stops on completion.
 */
export function useCampaign() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const [c, l] = await Promise.all([
          api.getCampaign(id),
          api.getCampaignLeads(id),
        ]);
        setCampaign(c);
        setLeads(l);
        if (c.status === 'completed' || c.status === 'failed') {
          stopPolling();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Polling failed');
        stopPolling();
      }
    },
    [stopPolling],
  );

  /** Begin tracking a campaign by id. */
  const track = useCallback(
    (id: string, initialLeads: Lead[]) => {
      setError(null);
      setLeads(initialLeads);
      stopPolling();
      void poll(id);
      timerRef.current = setInterval(() => void poll(id), POLL_INTERVAL_MS);
    },
    [poll, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setCampaign(null);
    setLeads([]);
    setError(null);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { campaign, leads, error, track, reset };
}
