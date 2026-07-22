import { AlertTriangle, PartyPopper, RotateCcw, CheckCircle2 } from 'lucide-react';
import type { Campaign } from '@/api/types';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from './AnimatedNumber';
import { campaignElapsed } from '@/lib/format';

interface Props {
  campaign: Campaign;
  onReset: () => void;
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border bg-background/60 p-4 text-center">
      <AnimatedNumber
        value={value}
        className={cn('text-2xl font-semibold tabular-nums', tone)}
      />
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function SummaryCard({ campaign, onReset }: Props) {
  const failed = campaign.status === 'failed';
  const allSent = campaign.failedCount === 0 && campaign.sentCount > 0;
  const successRate =
    campaign.totalLeads === 0
      ? 0
      : Math.round((campaign.sentCount / campaign.totalLeads) * 100);

  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          'flex items-center gap-4 px-6 py-6',
          failed
            ? 'bg-gradient-to-br from-destructive/15 to-destructive/5'
            : 'bg-gradient-to-br from-success/15 to-primary/10',
        )}
      >
        <div
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl',
            failed ? 'bg-destructive/15 text-destructive' : 'bg-success/20 text-success',
          )}
        >
          {failed ? (
            <AlertTriangle className="h-7 w-7" />
          ) : allSent ? (
            <PartyPopper className="h-7 w-7" />
          ) : (
            <CheckCircle2 className="h-7 w-7" />
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight">
            {failed
              ? 'Campaign ended with errors'
              : allSent
                ? 'All emails sent!'
                : 'Campaign complete'}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {campaign.sentCount} of {campaign.totalLeads} delivered ·{' '}
            {successRate}% success rate
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-4">
        <Tile label="Total" value={campaign.totalLeads} tone="text-foreground" />
        <Tile label="Sent" value={campaign.sentCount} tone="text-success" />
        <Tile label="Failed" value={campaign.failedCount} tone="text-destructive" />
        <div className="rounded-xl border bg-background/60 p-4 text-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {campaignElapsed(campaign.startedAt, campaign.completedAt)}
          </span>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Elapsed
          </p>
        </div>
      </div>

      <div className="px-6 pb-6">
        <Button size="lg" className="w-full" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          Start a new campaign
        </Button>
      </div>
    </Card>
  );
}
