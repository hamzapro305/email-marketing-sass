import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react';
import {
  AUDIT_STAGE_LABELS,
  AUDIT_STAGE_ORDER,
  type AuditLogEntry,
  type AuditLogLevel,
  type AuditStage,
  type LeadAudit,
  type StageState,
} from '@/api/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * The audit's execution trace — every stage with what it actually did, step
 * by step, and why. Running/failed stages open automatically; finished stages
 * collapse to a one-line outcome and expand on click.
 */

const LEVEL_ICON: Record<AuditLogLevel, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-muted-foreground" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatDuration = (ms: number) =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

function StageIcon({ status }: { status: StageState['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40" />;
  }
}

function LogLine({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(entry.level === 'error');
  const hasDetail = Boolean(entry.detail);
  return (
    <li className="group">
      <button
        type="button"
        disabled={!hasDetail}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left',
          hasDetail && 'hover:bg-muted/60',
        )}
      >
        <span className="mt-0.5 shrink-0">{LEVEL_ICON[entry.level]}</span>
        <span
          className={cn(
            'min-w-0 flex-1 text-sm',
            entry.level === 'warn' && 'text-foreground',
            entry.level === 'error' && 'text-destructive',
            entry.level === 'info' && 'text-foreground/80',
          )}
        >
          {entry.message}
        </span>
        <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground/70">
          {formatTime(entry.at)}
        </span>
        {hasDetail && (
          <ChevronRight
            className={cn(
              'mt-1 h-3 w-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        )}
      </button>
      {hasDetail && open && (
        <pre className="ml-8 mr-2 mt-0.5 mb-1.5 whitespace-pre-wrap break-words rounded-md border bg-muted/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground/80">
          {entry.detail}
        </pre>
      )}
    </li>
  );
}

/** Outcome line for a collapsed stage — its last warning/error, else its last line. */
function outcomeOf(entries: AuditLogEntry[], state: StageState | undefined): AuditLogEntry | null {
  if (state?.status === 'failed' && state.error) {
    return { at: state.completedAt ?? '', stage: 'run', level: 'error', message: state.error };
  }
  const problem = [...entries].reverse().find((e) => e.level === 'warn' || e.level === 'error');
  return problem ?? entries[entries.length - 1] ?? null;
}

function StageBlock({
  stage,
  state,
  entries,
  forceOpen,
}: {
  stage: AuditStage;
  state: StageState | undefined;
  entries: AuditLogEntry[];
  forceOpen: boolean;
}) {
  const status = state?.status ?? 'pending';
  const [open, setOpen] = useState(forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const warnings = entries.filter((e) => e.level === 'warn').length;
  const errors = entries.filter((e) => e.level === 'error').length;
  const outcome = outcomeOf(entries, state);
  const canOpen = entries.length > 0;

  return (
    <div className="relative pl-7">
      {/* timeline rail */}
      <span className="absolute left-[7px] top-6 bottom-0 w-px bg-border" aria-hidden />
      <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center bg-card">
        <StageIcon status={status} />
      </span>

      <button
        type="button"
        disabled={!canOpen}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          '-ml-2 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-md px-2 py-1 text-left',
          canOpen && 'hover:bg-muted/60',
        )}
      >
        <span
          className={cn(
            'text-sm font-medium',
            status === 'pending' && 'text-muted-foreground',
          )}
        >
          {AUDIT_STAGE_LABELS[stage]}
        </span>
        {status === 'running' && (
          <span className="text-xs text-primary">in progress…</span>
        )}
        {errors > 0 && <Badge variant="destructive">{errors} error{errors === 1 ? '' : 's'}</Badge>}
        {errors === 0 && warnings > 0 && (
          <Badge variant="warning">{warnings} warning{warnings === 1 ? '' : 's'}</Badge>
        )}
        <span className="ml-auto flex items-center gap-2">
          {state?.durationMs != null && status === 'completed' && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDuration(state.durationMs)}
            </span>
          )}
          {canOpen && (
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
          )}
        </span>
      </button>

      {!open && outcome && (
        <p
          className={cn(
            'mb-3 mt-0.5 truncate text-xs',
            outcome.level === 'warn' && 'text-warning',
            outcome.level === 'error' && 'text-destructive',
            (outcome.level === 'info' || outcome.level === 'success') && 'text-muted-foreground',
          )}
        >
          {outcome.message}
        </p>
      )}
      {!open && !outcome && <div className="mb-3" />}

      {open && (
        <ul className="mb-3 mt-1 space-y-0.5">
          {entries.map((e, i) => (
            <LogLine key={`${e.at}-${i}`} entry={e} />
          ))}
          {status === 'running' && (
            <li className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Working…
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function AuditTrace({ audit }: { audit: LeadAudit }) {
  const byStage = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const e of audit.activity ?? []) {
      const list = map.get(e.stage) ?? [];
      list.push(e);
      map.set(e.stage, list);
    }
    return map;
  }, [audit.activity]);

  const runEntries = byStage.get('run') ?? [];

  return (
    <div>
      {AUDIT_STAGE_ORDER.map((stage) => {
        const state = audit.stages?.[stage];
        return (
          <StageBlock
            key={stage}
            stage={stage}
            state={state}
            entries={byStage.get(stage) ?? []}
            forceOpen={state?.status === 'running' || state?.status === 'failed'}
          />
        );
      })}
      {runEntries.length > 0 && (
        <ul className="relative mt-1 space-y-0.5 pl-7">
          <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center bg-card">
            {audit.status === 'failed' ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )}
          </span>
          {runEntries.map((e, i) => (
            <LogLine key={`${e.at}-${i}`} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Diagnosis: the one-paragraph "why does this audit look like this" ─────

export interface AuditDiagnosis {
  tone: 'success' | 'warning' | 'destructive';
  title: string;
  detail: string;
  /** Which settings/lead action fixes it, if any. */
  action?: 'settings' | 'lead';
}

/**
 * Reads the audit and its trace to explain, in one sentence, why the result
 * is as rich or as thin as it is. Data-driven: it looks at engines, evidence
 * counts and the recorded warnings rather than guessing.
 */
export function diagnose(audit: LeadAudit): AuditDiagnosis | null {
  const activity = audit.activity ?? [];
  const firstWarn = (stage: AuditStage) =>
    activity.find((e) => e.stage === stage && (e.level === 'warn' || e.level === 'error'));

  if (audit.status === 'failed') {
    return {
      tone: 'destructive',
      title: 'The audit failed',
      detail: audit.error ?? 'A stage failed permanently. Open the trace below for details.',
    };
  }
  if (audit.status === 'running') return null;

  const engines = [audit.company?.engine, audit.analysis?.engine, audit.email?.engine].filter(
    Boolean,
  );
  const allFallback = engines.length > 0 && engines.every((e) => e === 'fallback');
  const noDomain = firstWarn('process') && audit.companyPages.length === 0 && !audit.company;

  if (noDomain) {
    return {
      tone: 'warning',
      title: 'Nothing to research — no company website',
      detail:
        firstWarn('process')?.detail ??
        'The lead uses a personal email and has no website, so no pages could be scraped.',
      action: 'lead',
    };
  }

  const aiWarn = firstWarn('research') ?? firstWarn('analyze') ?? firstWarn('email');
  if (allFallback) {
    const noProvider = /no ai provider/i.test(`${aiWarn?.message} ${aiWarn?.detail}`);
    return {
      tone: 'warning',
      title: noProvider ? 'Heuristic audit — no AI provider configured' : 'Heuristic audit — the AI provider failed',
      detail: noProvider
        ? 'Every AI step fell back to rules. Add a provider in Settings → AI providers and re-run for a real analysis and a personalized email.'
        : aiWarn?.detail ?? aiWarn?.message ?? 'The AI service returned fallbacks; see the trace for the exact error.',
      action: noProvider ? 'settings' : undefined,
    };
  }

  const partialFallback = engines.some((e) => e === 'fallback');
  if (partialFallback) {
    return {
      tone: 'warning',
      title: 'Some steps fell back to heuristics',
      detail: aiWarn?.detail ?? aiWarn?.message ?? 'One or more AI calls failed; the trace shows which.',
    };
  }

  if (audit.companyPages.length === 0) {
    return {
      tone: 'warning',
      title: 'The company website could not be read',
      detail:
        firstWarn('research')?.detail ??
        'The AI worked from the lead fields only, so findings are weakly grounded.',
    };
  }

  const rivalPages = audit.rivals.reduce((n, r) => n + r.pages.length, 0);
  return {
    tone: 'success',
    title: 'Fully grounded audit',
    detail:
      `${audit.companyPages.length} company page${audit.companyPages.length === 1 ? '' : 's'}, ` +
      `${audit.rivals.length} competitor${audit.rivals.length === 1 ? '' : 's'} (${rivalPages} page${rivalPages === 1 ? '' : 's'}), ` +
      `analysis and email by ${audit.analysis?.engine ?? audit.email?.engine}.`,
  };
}

/** Human label for an engine tag ("gemini", "fallback", …). */
export function engineLabel(engine: string | undefined | null): string {
  if (!engine) return '';
  if (engine === 'fallback') return 'Heuristic fallback — AI unavailable';
  if (engine === 'none') return 'No research';
  return `Generated by ${engine}`;
}
