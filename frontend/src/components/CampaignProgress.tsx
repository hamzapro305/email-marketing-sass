import { Check, Clock, X } from 'lucide-react';
import type { Campaign } from '@/api/types';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AnimatedNumber } from './AnimatedNumber';

function Ring({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          className="stroke-muted"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-primary transition-all duration-500"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-semibold tabular-nums">{percent}%</span>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2.5">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          tone,
        )}
      >
        {icon}
      </div>
      <div>
        <AnimatedNumber
          value={value}
          className="block text-lg font-semibold leading-none tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

export function CampaignProgress({ campaign }: { campaign: Campaign }) {
  const processed = campaign.sentCount + campaign.failedCount;
  const remaining = Math.max(0, campaign.totalLeads - processed);
  const percent =
    campaign.totalLeads === 0
      ? 0
      : Math.round((processed / campaign.totalLeads) * 100);
  const running = campaign.status === 'running';

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-5">
          <Ring percent={percent} />
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {running && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
                )}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <h3 className="text-base font-semibold">
                {running ? 'Sending campaign' : 'Wrapping up…'}
              </h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {processed} of {campaign.totalLeads} processed
            </p>
            <p className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground/70">
              {campaign.name}
            </p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Counter
            label="Sent"
            value={campaign.sentCount}
            icon={<Check className="h-4 w-4" />}
            tone="bg-success/10 text-success"
          />
          <Counter
            label="Failed"
            value={campaign.failedCount}
            icon={<X className="h-4 w-4" />}
            tone="bg-destructive/10 text-destructive"
          />
          <Counter
            label="Remaining"
            value={remaining}
            icon={<Clock className="h-4 w-4" />}
            tone="bg-muted text-muted-foreground"
          />
        </div>
      </div>
      <Progress value={percent} className="h-1.5 rounded-none" />
    </Card>
  );
}
