import { useCallback, useMemo, useState } from 'react';
import {
  addToast,
  Button,
  Card,
  CardBody,
  Chip,
} from '@heroui/react';
import { api } from '../api/client';
import type { ImportResult } from '../api/types';
import { useLeads } from '../hooks/useLeads';
import { useCampaign } from '../hooks/useCampaign';
import { ImportPanel } from '../components/ImportPanel';
import { LeadTable } from '../components/LeadTable';
import { CampaignProgress } from '../components/CampaignProgress';
import { SummaryCard } from '../components/SummaryCard';

export function WorkflowPage() {
  const { leads, setLeads, loading, error: leadsError, refresh } = useLeads();
  const {
    campaign,
    leads: liveLeads,
    error: campaignError,
    track,
    reset: resetCampaign,
  } = useCampaign();

  const [submitting, setSubmitting] = useState(false);

  const isRunning = campaign?.status === 'running' || submitting;
  const isDone =
    campaign?.status === 'completed' || campaign?.status === 'failed';

  // Table shows live campaign leads once a run has started, else the imports.
  const tableLeads = campaign ? liveLeads : leads;

  const onImported = useCallback(
    (result: ImportResult) => {
      addToast({
        title: 'Leads imported',
        description:
          `${result.imported} imported` +
          (result.skipped > 0 ? ` · ${result.skipped} skipped` : ''),
        color: 'success',
      });
      void refresh();
    },
    [refresh],
  );

  const onError = useCallback((message: string) => {
    addToast({ title: 'Something went wrong', description: message, color: 'danger' });
  }, []);

  const startCampaign = useCallback(async () => {
    setSubmitting(true);
    try {
      const created = await api.createCampaign();
      track(created._id, leads);
      addToast({
        title: 'Campaign started',
        description: `Processing ${created.totalLeads} leads…`,
        color: 'primary',
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to start campaign');
    } finally {
      setSubmitting(false);
    }
  }, [leads, track, onError]);

  const resetDemo = useCallback(async () => {
    try {
      await api.clearLeads();
    } catch {
      /* ignore — still reset the UI */
    }
    resetCampaign();
    setLeads([]);
    void refresh();
  }, [resetCampaign, setLeads, refresh]);

  const pendingCount = useMemo(
    () => leads.filter((l) => l.status === 'pending').length,
    [leads],
  );

  const hasLeads = leads.length > 0;

  return (
    <div className="app-backdrop min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg text-primary-foreground shadow-sm">
              ✉️
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">
                Email Marketing
              </h1>
              <p className="text-sm text-default-500">
                Import leads · run a campaign · watch it send
              </p>
            </div>
          </div>
          {(hasLeads || campaign) && (
            <Button
              variant="light"
              color="danger"
              size="sm"
              onPress={resetDemo}
              isDisabled={isRunning}
            >
              Reset demo
            </Button>
          )}
        </header>

        {(leadsError || campaignError) && (
          <Card className="border border-danger-200 bg-danger-50/50" shadow="none">
            <CardBody className="flex flex-row items-center gap-2 py-3 text-sm text-danger">
              <span>⚠️</span>
              <span>{leadsError || campaignError}</span>
            </CardBody>
          </Card>
        )}

        {/* Import (hidden during/after a run) */}
        {!campaign && (
          <ImportPanel
            onImported={onImported}
            onError={onError}
            disabled={isRunning}
          />
        )}

        {/* Progress while running */}
        {campaign && !isDone && <CampaignProgress campaign={campaign} />}

        {/* Summary when done */}
        {campaign && isDone && (
          <SummaryCard campaign={campaign} onReset={resetDemo} />
        )}

        {/* Lead table + action bar */}
        {(hasLeads || campaign) && (
          <Card shadow="sm" className="border border-default-200">
            <CardBody className="gap-4 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">Leads</h2>
                  <Chip size="sm" variant="flat">
                    {tableLeads.length}
                  </Chip>
                </div>
                {!campaign && (
                  <Button
                    color="primary"
                    className="font-medium"
                    onPress={startCampaign}
                    isLoading={submitting}
                    isDisabled={pendingCount === 0 || isRunning}
                  >
                    {submitting
                      ? 'Starting…'
                      : `Start campaign (${pendingCount})`}
                  </Button>
                )}
              </div>
              <LeadTable leads={tableLeads} loading={loading && !campaign} />
            </CardBody>
          </Card>
        )}

        {/* Idle empty state */}
        {!hasLeads && !campaign && !loading && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="text-4xl">📥</div>
            <p className="font-medium">No leads yet</p>
            <p className="max-w-sm text-sm text-default-500">
              Import a CSV or XLSX exported from Apollo to get started. Your
              leads will appear here, ready to send.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
