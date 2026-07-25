import { useState } from 'react';
import { FileSpreadsheet, Loader2, Trash2, Users } from 'lucide-react';
import type { CampaignFile } from '@/api/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  files: CampaignFile[];
  onDelete: (fileId: string) => Promise<void> | void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function FilesPanel({ files, onDelete, disabled }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (files.length === 0) return null;

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Uploaded files</h2>
        <p className="text-xs text-muted-foreground">
          Remove any file before starting — its leads won’t be sent.
        </p>
      </div>

      <ul className="space-y-2">
        {files.map((file) => (
          <li
            key={file._id}
            className="flex items-center gap-3 rounded-lg border bg-card/50 px-3 py-2.5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.originalName}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {file.leadCount} leads
                </Badge>
                {file.pendingCount !== file.leadCount && (
                  <Badge variant="success">{file.pendingCount} pending</Badge>
                )}
                {file.skipped > 0 && (
                  <Badge variant="warning">{file.skipped} skipped</Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(file._id)}
              disabled={disabled || deletingId === file._id}
              aria-label={`Delete ${file.originalName}`}
            >
              {deletingId === file._id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
