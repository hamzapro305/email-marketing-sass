import { useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { useAllLeads } from '@/hooks/useAllLeads';
import type { Route } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { StatCard } from '@/components/StatCard';
import { LeadTable } from '@/components/LeadTable';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
  navigate: (route: Route) => void;
}

export function LeadsPage({ isDark, onToggleTheme, navigate }: Props) {
  const { leads, loading, error, refresh } = useAllLeads();

  const stats = useMemo(() => {
    let sent = 0;
    let failed = 0;
    for (const l of leads) {
      if (l.status === 'sent') sent += 1;
      else if (l.status === 'failed') failed += 1;
    }
    return { total: leads.length, sent, failed };
  }, [leads]);

  return (
    <>
      <Header
        crumb="All leads"
        section="Leads"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 animate-fade-in px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every lead across all your campaigns. Click a row for details.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {!loading && leads.length === 0 && !error ? (
          <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">No leads yet</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Create a campaign and upload a lead list to get started.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-3 gap-3">
              <StatCard label="Total" value={stats.total} icon={Users} tone="primary" />
              <StatCard label="Sent" value={stats.sent} icon={CheckCircle2} tone="success" />
              <StatCard label="Failed" value={stats.failed} icon={AlertTriangle} tone="destructive" />
            </div>

            <Card className="p-5 sm:p-6">
              <LeadTable
                leads={leads}
                loading={loading}
                showCampaign
                onRowClick={(lead) => navigate({ name: 'lead', id: lead._id })}
              />
            </Card>
          </>
        )}
      </main>
    </>
  );
}
