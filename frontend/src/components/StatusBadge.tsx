import {
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
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
  queued: {
    label: 'Queued',
    variant: 'muted',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  researching: {
    label: 'Researching',
    variant: 'default',
    icon: <Search className="h-3 w-3 animate-pulse" />,
  },
  analyzing: {
    label: 'Analyzing',
    variant: 'default',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  ready: {
    label: 'Audit ready',
    variant: 'success',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  writing: {
    label: 'Writing',
    variant: 'default',
    icon: <Sparkles className="h-3 w-3 animate-pulse" />,
  },
  sending: {
    label: 'Sending',
    variant: 'default',
    icon: <Send className="h-3 w-3 animate-pulse" />,
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
