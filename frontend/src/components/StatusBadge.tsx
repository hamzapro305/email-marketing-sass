import { Chip, Tooltip } from '@heroui/react';
import type { LeadStatus } from '../api/types';

interface Props {
  status: LeadStatus;
  errorMessage?: string | null;
}

const CONFIG: Record<
  LeadStatus,
  { label: string; color: 'default' | 'primary' | 'success' | 'danger'; icon: string }
> = {
  pending: { label: 'Pending', color: 'default', icon: '○' },
  sending: { label: 'Sending', color: 'primary', icon: '◐' },
  sent: { label: 'Sent', color: 'success', icon: '✓' },
  failed: { label: 'Failed', color: 'danger', icon: '✕' },
};

/** Maps a lead status enum to a colored, labelled, icon'd chip. */
export function StatusBadge({ status, errorMessage }: Props) {
  const cfg = CONFIG[status];

  const chip = (
    <Chip
      color={cfg.color}
      variant="flat"
      size="sm"
      startContent={
        <span
          className={
            'text-[0.7rem] leading-none ' +
            (status === 'sending' ? 'ems-pulse' : '')
          }
          aria-hidden
        >
          {cfg.icon}
        </span>
      }
      className="font-medium"
    >
      {cfg.label}
    </Chip>
  );

  if (status === 'failed' && errorMessage) {
    return (
      <Tooltip
        content={errorMessage}
        color="danger"
        placement="top"
        className="max-w-xs"
      >
        {chip}
      </Tooltip>
    );
  }

  return chip;
}
