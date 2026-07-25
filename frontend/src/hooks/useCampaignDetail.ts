import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Campaign, CampaignFile, Lead } from '../api/types';

const POLL_INTERVAL_MS = 1500;

/**
 * Loads a single campaign with its files and leads. While the campaign is
 * `running` it polls so per-lead status and counters update live — this keeps
 * working even though the backend processes the queue independently.
 */
export function useCampaignDetail(id: string) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [files, setFiles] = useState<CampaignFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const refreshFiles = useCallback(async () => {
    try {
      setFiles(await api.listCampaignFiles(id));
    } catch {
      /* non-fatal */
    }
  }, [id]);

  const load = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) setLoading(true);
      try {
        const [c, l] = await Promise.all([
          api.getCampaign(id),
          api.getCampaignLeads(id),
        ]);
        setCampaign(c);
        setLeads(l);
        setError(null);
        return c;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load campaign');
        return null;
      } finally {
        if (withSpinner) setLoading(false);
      }
    },
    [id],
  );

  const startPolling = useCallback(() => {
    stop();
    timer.current = setInterval(() => {
      void load().then((c) => {
        if (c && c.status !== 'running') stop();
      });
    }, POLL_INTERVAL_MS);
  }, [load, stop]);

  const refresh = useCallback(async () => {
    const c = await load(true);
    await refreshFiles();
    if (c?.status === 'running') startPolling();
  }, [load, refreshFiles, startPolling]);

  useEffect(() => {
    void refresh();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return {
    campaign,
    leads,
    files,
    loading,
    error,
    refresh,
    refreshFiles,
    startPolling,
  };
}
