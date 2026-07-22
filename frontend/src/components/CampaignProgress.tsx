import { Card, CardBody, Chip, Progress } from '@heroui/react';
import type { Campaign } from '../api/types';

interface Props {
  campaign: Campaign;
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4">
      <span className={`text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </span>
      <span className="text-xs uppercase tracking-wide text-default-500">
        {label}
      </span>
    </div>
  );
}

export function CampaignProgress({ campaign }: Props) {
  const processed = campaign.sentCount + campaign.failedCount;
  const remaining = Math.max(0, campaign.totalLeads - processed);
  const percent =
    campaign.totalLeads === 0
      ? 0
      : Math.round((processed / campaign.totalLeads) * 100);
  const isRunning = campaign.status === 'running';

  return (
    <Card shadow="sm" className="border border-default-200">
      <CardBody className="gap-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Campaign progress</h3>
            <Chip
              size="sm"
              variant="dot"
              color={isRunning ? 'primary' : 'success'}
            >
              {isRunning ? 'Running' : campaign.status}
            </Chip>
          </div>
          <span className="text-sm font-medium text-default-500 tabular-nums">
            {processed}/{campaign.totalLeads} · {percent}%
          </span>
        </div>

        <Progress
          aria-label="Campaign progress"
          value={percent}
          color={isRunning ? 'primary' : 'success'}
          isIndeterminate={isRunning && processed === 0}
          className="max-w-full"
        />

        <div className="flex items-stretch justify-around divide-x divide-default-200">
          <Stat label="Sent" value={campaign.sentCount} color="text-success" />
          <Stat
            label="Failed"
            value={campaign.failedCount}
            color="text-danger"
          />
          <Stat label="Remaining" value={remaining} color="text-default-700" />
        </div>
      </CardBody>
    </Card>
  );
}
