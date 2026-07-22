import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Building2,
  Briefcase,
  Rocket,
  Loader2,
  Upload,
  ClipboardList,
} from 'lucide-react';
import { api } from '@/api/client';
import type { ImportResult } from '@/api/types';
import { useLeads } from '@/hooks/useLeads';
import { useCampaign } from '@/hooks/useCampaign';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { Stepper } from '@/components/Stepper';
import { StatCard } from '@/components/StatCard';
import { ImportPanel } from '@/components/ImportPanel';
import { LeadTable } from '@/components/LeadTable';
import { CampaignProgress } from '@/components/CampaignProgress';
import { SummaryCard } from '@/components/SummaryCard';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function WorkflowPage({ isDark, onToggleTheme }: Props) {
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
  const tableLeads = campaign ? liveLeads : leads;
  const hasLeads = leads.length > 0;

  // Workflow step: 0 Import · 1 Review · 2 Send · 3 Complete
  const step = isDone ? 3 : campaign ? 2 : hasLeads ? 1 : 0;
  const crumb = isDone
    ? 'Results'
    : campaign
      ? 'Sending'
      : hasLeads
        ? 'Review'
        : 'New campaign';

  const pendingCount = useMemo(
    () => leads.filter((l) => l.status === 'pending').length,
    [leads],
  );
  const companyCount = useMemo(
    () => new Set(leads.map((l) => l.company).filter(Boolean)).size,
    [leads],
  );

  const onImported = useCallback(
    (result: ImportResult) => {
      toast.success('Leads imported', {
        description:
          `${result.imported} imported` +
          (result.skipped > 0 ? ` · ${result.skipped} skipped` : ''),
      });
      void refresh();
    },
    [refresh],
  );

  const onError = useCallback((message: string) => {
    toast.error('Something went wrong', { description: message });
  }, []);

  const startCampaign = useCallback(async () => {
    setSubmitting(true);
    try {
      const created = await api.createCampaign();
      track(created._id, leads);
      toast('Campaign started', {
        description: `Sending to ${created.totalLeads} leads…`,
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

  const heading = isDone
    ? 'Campaign results'
    : campaign
      ? 'Campaign in progress'
      : hasLeads
        ? 'Review your leads'
        : 'Start a new campaign';
  const subheading = isDone
    ? 'Here’s how your campaign performed.'
    : campaign
      ? 'Watch each lead as the agent sends its email.'
      : hasLeads
        ? 'Looks good? Launch the campaign when you’re ready.'
        : 'Import a lead list to begin — no emails are actually sent in demo mode.';

  return (
    <>
      <Header
        crumb={crumb}
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onReset={resetDemo}
        resetDisabled={isRunning}
        showReset={hasLeads || !!campaign}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 animate-fade-in px-6 py-8">
        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
        </div>

        {/* Stepper */}
        <Card className="mb-8 px-5 py-4">
          <Stepper current={step} />
        </Card>

        {(leadsError || campaignError) && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{leadsError || campaignError}</span>
          </div>
        )}

        {/* Stats */}
        {(hasLeads || campaign) && (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total leads"
              value={campaign ? campaign.totalLeads : leads.length}
              icon={Users}
              tone="primary"
            />
            {campaign ? (
              <>
                <StatCard
                  label="Sent"
                  value={campaign.sentCount}
                  icon={CheckCircle2}
                  tone="success"
                />
                <StatCard
                  label="Failed"
                  value={campaign.failedCount}
                  icon={AlertTriangle}
                  tone="destructive"
                />
                <StatCard
                  label="Remaining"
                  value={Math.max(
                    0,
                    campaign.totalLeads -
                      campaign.sentCount -
                      campaign.failedCount,
                  )}
                  icon={Clock}
                  tone="warning"
                />
              </>
            ) : (
              <>
                <StatCard
                  label="Ready to send"
                  value={pendingCount}
                  icon={Send}
                  tone="success"
                />
                <StatCard
                  label="Companies"
                  value={companyCount}
                  icon={Building2}
                  tone="default"
                />
                <StatCard
                  label="With title"
                  value={leads.filter((l) => l.title).length}
                  icon={Briefcase}
                  tone="default"
                />
              </>
            )}
          </div>
        )}

        {/* Progress / summary */}
        {campaign && !isDone && (
          <div className="mb-6">
            <CampaignProgress campaign={campaign} />
          </div>
        )}
        {campaign && isDone && (
          <div className="mb-6">
            <SummaryCard campaign={campaign} onReset={resetDemo} />
          </div>
        )}

        {/* Import */}
        {!campaign && (
          <div className="mb-6">
            <ImportPanel
              onImported={onImported}
              onError={onError}
              disabled={isRunning}
            />
          </div>
        )}

        {/* Lead table */}
        {(hasLeads || campaign) && (
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Leads</h2>
                <p className="text-xs text-muted-foreground">
                  {campaign
                    ? 'Live status for every recipient'
                    : 'Imported and ready to send'}
                </p>
              </div>
              {!campaign && (
                <Button
                  size="lg"
                  className="shadow-sm shadow-primary/30"
                  onClick={startCampaign}
                  disabled={pendingCount === 0 || isRunning}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  {submitting ? 'Starting…' : `Start campaign · ${pendingCount}`}
                </Button>
              )}
            </div>
            <LeadTable leads={tableLeads} loading={loading && !campaign} />
          </Card>
        )}

        {/* Idle helper */}
        {!hasLeads && !campaign && !loading && (
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: Upload,
                title: 'Import',
                text: 'Upload a CSV/XLSX exported from Apollo.',
              },
              {
                icon: ClipboardList,
                title: 'Review',
                text: 'Check your leads in a clean table.',
              },
              {
                icon: Rocket,
                title: 'Send',
                text: 'Launch and watch statuses update live.',
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.title} className="p-5">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
                </Card>
              );
            })}
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Mailflow · demo agent simulates sending (5–10s / lead) — switch to real
          SMTP with one env flag.
        </footer>
      </main>
    </>
  );
}
