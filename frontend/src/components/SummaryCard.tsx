import { Button, Card, CardBody } from '@heroui/react';
import type { Campaign } from '../api/types';

interface Props {
  campaign: Campaign;
  onReset: () => void;
}

function elapsed(campaign: Campaign): string {
  if (!campaign.startedAt || !campaign.completedAt) return '—';
  const ms =
    new Date(campaign.completedAt).getTime() -
    new Date(campaign.startedAt).getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function SummaryCard({ campaign, onReset }: Props) {
  const failed = campaign.status === 'failed';
  const allSent = campaign.failedCount === 0 && campaign.sentCount > 0;

  return (
    <Card
      shadow="sm"
      className={
        'border ' +
        (failed
          ? 'border-danger-200 bg-danger-50/50'
          : 'border-success-200 bg-success-50/40')
      }
    >
      <CardBody className="gap-5 p-6">
        <div className="flex items-center gap-3">
          <div
            className={
              'flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ' +
              (failed ? 'bg-danger/15' : 'bg-success/15')
            }
          >
            {failed ? '⚠️' : allSent ? '🎉' : '✅'}
          </div>
          <div>
            <h3 className="text-lg font-semibold">
              {failed ? 'Campaign ended with errors' : 'Campaign complete'}
            </h3>
            <p className="text-sm text-default-500">
              {campaign.name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="rounded-xl bg-content1 p-3 shadow-sm">
            <p className="text-xl font-semibold tabular-nums">
              {campaign.totalLeads}
            </p>
            <p className="text-xs text-default-500">Total</p>
          </div>
          <div className="rounded-xl bg-content1 p-3 shadow-sm">
            <p className="text-xl font-semibold tabular-nums text-success">
              {campaign.sentCount}
            </p>
            <p className="text-xs text-default-500">Sent</p>
          </div>
          <div className="rounded-xl bg-content1 p-3 shadow-sm">
            <p className="text-xl font-semibold tabular-nums text-danger">
              {campaign.failedCount}
            </p>
            <p className="text-xs text-default-500">Failed</p>
          </div>
          <div className="rounded-xl bg-content1 p-3 shadow-sm">
            <p className="text-xl font-semibold tabular-nums">
              {elapsed(campaign)}
            </p>
            <p className="text-xs text-default-500">Elapsed</p>
          </div>
        </div>

        <Button color="primary" variant="flat" onPress={onReset}>
          Start a new campaign
        </Button>
      </CardBody>
    </Card>
  );
}
