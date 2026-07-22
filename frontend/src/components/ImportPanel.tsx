import { useCallback, useRef, useState } from 'react';
import { Button, Card, CardBody, Spinner } from '@heroui/react';
import { api } from '../api/client';
import { parseLeadFile } from '../api/parse-file';
import type { ImportResult, ParsedLead } from '../api/types';

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
            `No valid leads found in "${file.name}". Check that it has an email column.`,
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

  // ── Preview state ─────────────────────────────────────────
  if (preview) {
    return (
      <Card shadow="sm" className="border border-default-200">
        <CardBody className="gap-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
              📄
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{preview.fileName}</p>
              <p className="text-sm text-default-500">
                <span className="text-success font-medium">
                  {preview.rows.length} valid
                </span>
                {preview.skipped > 0 && (
                  <>
                    {' · '}
                    <span className="text-warning font-medium">
                      {preview.skipped} skipped
                    </span>{' '}
                    (missing/invalid email)
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              color="primary"
              className="flex-1 font-medium"
              onPress={doImport}
              isLoading={importing}
            >
              {importing ? 'Importing…' : `Import ${preview.rows.length} leads`}
            </Button>
            <Button
              variant="flat"
              onPress={() => setPreview(null)}
              isDisabled={importing}
            >
              Choose different file
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  // ── Dropzone state ────────────────────────────────────────
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
          inputRef.current?.click();
        }
      }}
      className={[
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-default-300 hover:border-primary/60 hover:bg-default-100/50',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
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
          <Spinner color="primary" />
          <p className="text-sm text-default-500">Reading file…</p>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
            ⬆️
          </div>
          <div>
            <p className="font-semibold">
              Drop a CSV or XLSX here, or click to browse
            </p>
            <p className="mt-1 text-sm text-default-500">
              Apollo exports supported · email, name, company, title
            </p>
          </div>
        </>
      )}
    </div>
  );
}
