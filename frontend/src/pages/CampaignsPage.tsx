import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Megaphone,
  Trash2,
  Users,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import type { Campaign } from '@/api/types';
import { api } from '@/api/client';
import { useCampaigns } from '@/hooks/useCampaigns';
import type { Route } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/Header';
import { CampaignStatusBadge } from '@/components/CampaignStatusBadge';
import { CreateCampaignDialog } from '@/components/CreateCampaignDialog';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
  navigate: (route: Route) => void;
}

export function CampaignsPage({ isDark, onToggleTheme, navigate }: Props) {
  const { campaigns, loading, error, refresh } = useCampaigns();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onError = useCallback((message: string) => {
    toast.error('Something went wrong', { description: message });
  }, []);

  const onCreated = useCallback(
    (campaign: Campaign) => {
      setDialogOpen(false);
      toast.success('Campaign created', { description: campaign.name });
      navigate({ name: 'campaign', id: campaign._id });
    },
    [navigate],
  );

  const onDelete = useCallback(
    async (e: React.MouseEvent, campaign: Campaign) => {
      e.stopPropagation();
      if (campaign.status === 'running') return;
      setDeletingId(campaign._id);
      try {
        await api.deleteCampaign(campaign._id);
        toast('Campaign deleted', { description: campaign.name });
        await refresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to delete');
      } finally {
        setDeletingId(null);
      }
    },
    [refresh, onError],
  );

  return (
    <>
      <Header crumb="All campaigns" isDark={isDark} onToggleTheme={onToggleTheme} />

      <main className="mx-auto w-full max-w-5xl flex-1 animate-fade-in px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a campaign, add leads, and send in parallel across the
              worker pool.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New campaign
          </Button>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && campaigns.length === 0 && !error && (
          <Card className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Megaphone className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium">No campaigns yet</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Create your first campaign to get started.
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="mt-1 gap-1.5">
              <Plus className="h-4 w-4" />
              New campaign
            </Button>
          </Card>
        )}

        {/* List */}
        {!loading && campaigns.length > 0 && (
          <div className="space-y-2.5">
            {campaigns.map((c) => {
              const remaining = Math.max(
                0,
                c.totalLeads - c.sentCount - c.failedCount,
              );
              return (
                <Card
                  key={c._id}
                  role="button"
                  onClick={() => navigate({ name: 'campaign', id: c._id })}
                  className="group flex cursor-pointer items-center gap-4 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{c.name}</p>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.description || 'AI-written emails'} ·{' '}
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="hidden items-center gap-4 text-sm sm:flex">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {c.totalLeads}
                    </span>
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {c.sentCount}
                    </span>
                    {c.failedCount > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {c.failedCount}
                      </span>
                    )}
                    {c.status === 'running' && (
                      <span className="text-xs text-warning">
                        {remaining} left
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={c.status === 'running' || deletingId === c._id}
                    onClick={(e) => onDelete(e, c)}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <CreateCampaignDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={onCreated}
        onError={onError}
      />
    </>
  );
}
