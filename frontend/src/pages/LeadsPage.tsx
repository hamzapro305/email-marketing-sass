import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { useAllLeads } from '@/hooks/useAllLeads';
import type { Route } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { LeadTable } from '@/components/LeadTable';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
  navigate: (route: Route) => void;
}

export function LeadsPage({ isDark, onToggleTheme, navigate }: Props) {
  const { leads, total, page, totalPages, setPage, loading, error, refresh } =
    useAllLeads();

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
              {total > 0
                ? `${total.toLocaleString()} lead${total === 1 ? '' : 's'} across all campaigns. Click a row for its full audit.`
                : 'Every lead across all your campaigns. Click a row for details.'}
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
          <Card className="p-5 sm:p-6">
            <LeadTable
              leads={leads}
              loading={loading}
              showCampaign
              onRowClick={(lead) => navigate({ name: 'lead', id: lead._id })}
            />

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </main>
    </>
  );
}
