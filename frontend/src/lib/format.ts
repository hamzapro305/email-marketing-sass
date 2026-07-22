import type { Lead } from '../api/types';

export function fullName(lead: Pick<Lead, 'firstName' | 'lastName'>): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
}

export function initials(lead: Pick<Lead, 'firstName' | 'lastName' | 'email'>): string {
  const f = (lead.firstName || '').trim();
  const l = (lead.lastName || '').trim();
  if (f || l) return ((f[0] ?? '') + (l[0] ?? '')).toUpperCase() || '?';
  const handle = (lead.email || '?').trim();
  return (handle[0] ?? '?').toUpperCase();
}

// Deterministic, pleasant avatar gradient from a seed string.
const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#ec4899,#f43f5e)',
  'linear-gradient(135deg,#10b981,#06b6d4)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#14b8a6,#3b82f6)',
  'linear-gradient(135deg,#f97316,#eab308)',
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function campaignElapsed(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt || !completedAt) return '—';
  return formatDuration(
    new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  );
}
