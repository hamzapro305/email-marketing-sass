import { Check, Upload, ClipboardList, Rocket, PartyPopper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS: { label: string; icon: LucideIcon }[] = [
  { label: 'Import', icon: Upload },
  { label: 'Review', icon: ClipboardList },
  { label: 'Send', icon: Rocket },
  { label: 'Complete', icon: PartyPopper },
];

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex w-full items-center">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const isLast = i === STEPS.length - 1;
        const Icon = step.icon;

        return (
          <li
            key={step.label}
            className={cn('flex items-center', !isLast && 'flex-1')}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active &&
                    'border-primary bg-primary/10 text-primary ring-4 ring-primary/10',
                  !done && !active && 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-[18px] w-[18px]" />
                )}
              </div>
              <span
                className={cn(
                  'hidden text-sm font-medium transition-colors sm:block',
                  active
                    ? 'text-foreground'
                    : done
                      ? 'text-foreground/70'
                      : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: done ? '100%' : '0%' }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
