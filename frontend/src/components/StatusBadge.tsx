import { Check, Clock, Loader2, X } from 'lucide-react';
import type { LeadStatus } from '@/api/types';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  status: LeadStatus;
  errorMessage?: string | null;
}

const CONFIG: Record<
  LeadStatus,
  { label: string; variant: BadgeProps['variant']; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pending',
    variant: 'muted',
    icon: <Clock className="h-3 w-3" />,
  },
  sending: {
    label: 'Sending',
    variant: 'default',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  sent: {
    label: 'Sent',
    variant: 'success',
    icon: <Check className="h-3 w-3" />,
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    icon: <X className="h-3 w-3" />,
  },
};

export function StatusBadge({ status, errorMessage }: Props) {
  const cfg = CONFIG[status];
  const badge = (
    <Badge variant={cfg.variant}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );

  if (status === 'failed' && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help">
            {badge}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs bg-destructive text-destructive-foreground">
          {errorMessage}
        </TooltipContent>
      </Tooltip>
    );
  }
  return badge;
}
