import { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Download, UploadCloud } from 'lucide-react';
import { api } from '@/api/client';
import { parseLeadFile } from '@/api/parse-file';
import type { ImportResult, ParsedLead } from '@/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  onImported: (result: ImportResult) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

interface Preview {
  fileName: string;
  rows: ParsedLead[];
  skipped: number;
}

const ACCEPT = '.csv,.xlsx,.xls';

export function ImportPanel({ onImported, onError, disabled }: Props) {
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
        const { rows, skipped } = await parseLeadFile(file);
        if (rows.length === 0) {
          onError(
            `No valid leads found in "${file.name}". Make sure it has an email column.`,
          );
          return;
        }
        setPreview({ fileName: file.name, rows, skipped });
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
      const result = await api.importLeads(preview.rows);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported(result);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [preview, onImported, onError]);

  // ── Preview ───────────────────────────────────────────────
  if (preview) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{preview.fileName}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="success">{preview.rows.length} valid leads</Badge>
              {preview.skipped > 0 && (
                <Badge variant="warning">{preview.skipped} skipped</Badge>
              )}
            </div>
          </div>
        </div>
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
