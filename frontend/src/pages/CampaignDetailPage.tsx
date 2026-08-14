import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Rocket,
  Loader2,
  Server,
} from 'lucide-react';
import type { UploadResult } from '@/api/types';
import { api } from '@/api/client';
import { useCampaignDetail } from '@/hooks/useCampaignDetail';
import { useSmtpAccounts } from '@/hooks/useSmtpAccounts';
import type { Route } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/StatCard';
import { CampaignStatusBadge } from '@/components/CampaignStatusBadge';
import { ImportPanel } from '@/components/ImportPanel';
import { FilesPanel } from '@/components/FilesPanel';
import { LeadTable } from '@/components/LeadTable';
import { CampaignProgress } from '@/components/CampaignProgress';
import { SummaryCard } from '@/components/SummaryCard';

interface Props {
  id: string;
  isDark: boolean;
  onToggleTheme: () => void;
  navigate: (route: Route) => void;
}

export function CampaignDetailPage({ id, isDark, onToggleTheme, navigate }: Props) {
  const {
    campaign,
    leads,
    files,
    loading,
    error,
    refresh,
    startPolling,
  } = useCampaignDetail(id);
  const smtp = useSmtpAccounts();
  const [starting, setStarting] = useState(false);

  const onError = useCallback((message: string) => {
    toast.error('Something went wrong', { description: message });
  }, []);

  const pendingCount = useMemo(
    () => leads.filter((l) => l.status === 'pending').length,
    [leads],
  );

  const isRunning = campaign?.status === 'running';
  const isDone =
    campaign?.status === 'completed' || campaign?.status === 'failed';

  const onImported = useCallback(
    (result: UploadResult) => {
      toast.success('Leads added', {
        description:
          `${result.imported} leads` +
          (result.skipped > 0 ? ` · ${result.skipped} skipped` : '') +
          (result.duplicates > 0 ? ` · ${result.duplicates} duplicates` : ''),
      });
      void refresh();
    },
    [refresh],
  );

  const upload = useCallback(
    (file: File) => api.uploadToCampaign(id, file),
    [id],
  );

  const onDeleteFile = useCallback(
    async (fileId: string) => {
      try {
        await api.deleteCampaignFile(id, fileId);
        toast('File removed');
        await refresh();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to delete file');
      }
    },
    [id, refresh, onError],
  );

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const c = await api.startCampaign(id);
      toast('Campaign started', {
        description: `Sending to ${Math.max(
          0,
          c.totalLeads - c.sentCount - c.failedCount,
        )} leads in parallel…`,
      });
      await refresh();
      startPolling();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to start campaign');
    } finally {
      setStarting(false);
    }
  }, [id, refresh, startPolling, onError]);

  const backToCampaigns = () => navigate({ name: 'campaigns' });

  return (
    <>
      <Header
        crumb={campaign?.name ?? 'Campaign'}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 animate-fade-in px-6 py-8">
        <button
          type="button"
          onClick={backToCampaigns}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All campaigns
        </button>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {loading && !campaign && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {campaign && (
          <>
            {/* Heading */}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {campaign.name}
                  </h1>
                  <CampaignStatusBadge status={campaign.status} />
                </div>
                {campaign.description && (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {campaign.description}
                  </p>
                )}
              </div>

              {!isRunning && pendingCount > 0 && (
                <Button
                  size="lg"
                  onClick={start}
                  disabled={starting || !smtp.hasAny}
                  title={
                    smtp.hasAny
                      ? undefined
                      : 'Connect an SMTP account in Settings to send'
                  }
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  {starting
                    ? 'Starting…'
                    : `${isDone ? 'Send new leads' : 'Start campaign'} · ${pendingCount}`}
                </Button>
              )}
            </div>

            {/* Sending gate — no SMTP account configured */}
            {!isRunning && pendingCount > 0 && !smtp.loading && !smtp.hasAny && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Server className="h-4 w-4 shrink-0 text-warning" />
                  Connect an SMTP account before you can send this campaign.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ name: 'settings' })}
                >
                  Go to Settings
                </Button>
              </div>
            )}

            {/* Stats */}
            {campaign.totalLeads > 0 && (
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total leads" value={campaign.totalLeads} icon={Users} tone="primary" />
                <StatCard label="Sent" value={campaign.sentCount} icon={CheckCircle2} tone="success" />
                <StatCard label="Failed" value={campaign.failedCount} icon={AlertTriangle} tone="destructive" />
                <StatCard
                  label={isRunning ? 'Remaining' : 'Pending'}
                  value={Math.max(0, campaign.totalLeads - campaign.sentCount - campaign.failedCount)}
                  icon={isRunning ? Clock : Send}
                  tone="warning"
                />
              </div>
            )}

            {/* Progress / summary */}
            {isRunning && (
              <div className="mb-6">
                <CampaignProgress campaign={campaign} />
              </div>
            )}
            {isDone && (
              <div className="mb-6">
                <SummaryCard campaign={campaign} onReset={backToCampaigns} />
              </div>
            )}

            {/* Add leads (not while running) */}
            {!isRunning && (
              <div className="mb-6">
                <ImportPanel
                  upload={upload}
                  onImported={onImported}
                  onError={onError}
                />
              </div>
            )}

            {!isRunning && files.length > 0 && (
              <div className="mb-6">
                <FilesPanel files={files} onDelete={onDeleteFile} />
              </div>
            )}

            {/* Leads */}
            {(leads.length > 0 || isRunning) && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold">Leads</h2>
                  <p className="text-xs text-muted-foreground">
                    {isRunning
                      ? 'Live status for every recipient'
                      : 'Click Start to send to all pending leads'}
                  </p>
                </div>
                <LeadTable
                  leads={leads}
                  loading={loading && leads.length === 0}
                  onRowClick={(lead) => navigate({ name: 'lead', id: lead._id })}
                />
              </Card>
            )}

            {/* Empty leads hint */}
            {!isRunning && leads.length === 0 && !loading && files.length === 0 && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Upload a CSV/XLSX above to add leads to this campaign.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
