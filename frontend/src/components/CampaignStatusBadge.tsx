import { CheckCircle2, FileEdit, Loader2, XCircle } from 'lucide-react';
import type { CampaignStatus } from '@/api/types';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const CONFIG: Record<
  CampaignStatus,
  { label: string; variant: BadgeProps['variant']; icon: React.ReactNode }
> = {
  draft: {
    label: 'Draft',
    variant: 'muted',
    icon: <FileEdit className="h-3 w-3" />,
  },
  running: {
    label: 'Running',
    variant: 'warning',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: 'Completed',
    variant: 'success',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3" />,
  },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = CONFIG[status];
  return (
    <Badge variant={cfg.variant}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}
