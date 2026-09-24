import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Download, UploadCloud } from 'lucide-react';
import { parseLeadFile } from '@/api/parse-file';
import type { ParsedLead, UploadResult } from '@/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  /** Uploads the chosen file (e.g. into a specific campaign). */
  upload: (file: File) => Promise<UploadResult>;
  onImported: (result: UploadResult) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

interface Preview {
  file: File;
  rows: ParsedLead[];
  skipped: number;
  warnings: string[];
}

const ACCEPT = '.csv,.xlsx,.xls';

export function ImportPanel({ upload, onImported, onError, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setPreview(null);
      try {
        const { rows, skipped, warnings } = await parseLeadFile(file);
        if (rows.length === 0) {
          onError(
            `No valid leads found in "${file.name}". Make sure it has an email column.`,
          );
          return;
        }
        setPreview({ file, rows, skipped, warnings });
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Failed to parse file');
      } finally {
        setParsing(false);
      }
    },
    [onError],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [disabled, handleFile],
  );

  const doImport = useCallback(async () => {
    if (!preview) return;
    setImporting(true);
    try {
      // Upload the raw file so the backend records it against the campaign and
      // stores its leads — the file can then be reviewed/deleted before sending.
      const result = await upload(preview.file);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported(result);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setImporting(false);
    }
  }, [preview, upload, onImported, onError]);

  // ── Preview ───────────────────────────────────────────────
  if (preview) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{preview.file.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="success">{preview.rows.length} valid leads</Badge>
              {preview.skipped > 0 && (
                <Badge variant="warning">{preview.skipped} skipped</Badge>
              )}
            </div>
          </div>
        </div>
        {preview.warnings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {preview.warnings.map((w) => (
              <li
                key={w}
                className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="flex-1"
            onClick={doImport}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {importing ? 'Importing…' : `Import ${preview.rows.length} leads`}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setPreview(null)}
            disabled={importing}
          >
            Choose another
          </Button>
        </div>
      </div>
    );
  }

  // ── Dropzone ──────────────────────────────────────────────
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        'group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {parsing ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Reading file…
          </p>
        </>
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary transition-transform duration-300 group-hover:scale-110">
            <UploadCloud className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">Drop your leads file here</p>
            <p className="text-sm text-muted-foreground">
              or <span className="font-medium text-primary">click to browse</span>{' '}
              — CSV or Excel exported from Apollo
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {['CSV', 'XLSX', 'XLS'].map((f) => (
              <span
                key={f}
                className="rounded-md border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
