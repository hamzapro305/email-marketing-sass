import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { AnimatedNumber } from './AnimatedNumber';

type Tone = 'default' | 'primary' | 'success' | 'destructive' | 'warning';

const TONE: Record<Tone, { text: string; bg: string }> = {
  default: { text: 'text-foreground', bg: 'bg-muted text-muted-foreground' },
  primary: { text: 'text-foreground', bg: 'bg-primary/10 text-primary' },
  success: { text: 'text-foreground', bg: 'bg-success/10 text-success' },
  destructive: {
    text: 'text-foreground',
    bg: 'bg-destructive/10 text-destructive',
  },
  warning: { text: 'text-foreground', bg: 'bg-warning/10 text-warning' },
};

interface Props {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: Tone;
}

export function StatCard({ label, value, icon: Icon, tone = 'default' }: Props) {
  const t = TONE[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            t.bg,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <AnimatedNumber
        value={value}
        className={cn('mt-2 block text-2xl font-semibold tabular-nums', t.text)}
      />
    </Card>
  );
}
