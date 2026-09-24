import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Lightbulb,
  ListChecks,
  Loader2,
  Settings2,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  Play,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { useLead } from '@/hooks/useLead';
import { useLeadAudit } from '@/hooks/useLeadAudit';
import { fullName, initials, avatarGradient } from '@/lib/format';
import type { Route } from '@/lib/nav';
import {
  ACTIVE_LEAD_STATUSES,
  type AnalysisItem,
  type LeadAudit,
  type Rival,
  type WebsiteSignals,
} from '@/api/types';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/StatusBadge';
import { AuditTrace, diagnose, engineLabel } from '@/components/AuditTrace';

interface Props {
  id: string;
  isDark: boolean;
  onToggleTheme: () => void;
  navigate: (route: Route) => void;
}

// ── small building blocks ──────────────────────────────────────

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm">{value || '—'}</div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function SignalChips({ signals }: { signals: WebsiteSignals }) {
  const bool = (ok: boolean, label: string) => (
    <Badge key={label} variant={ok ? 'success' : 'destructive'}>
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </Badge>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {bool(signals.hasPricingPage, 'Pricing page')}
      {bool(signals.hasBlog, 'Blog')}
      {bool(signals.hasContactPage, 'Contact page')}
      {bool(signals.hasCareersPage, 'Careers')}
      {bool(!signals.missingMetaDescription, 'Meta description')}
      {bool(signals.socialLinks.length > 0, 'Social presence')}
      <Badge variant="muted">{signals.homepageWordCount} words on homepage</Badge>
      {signals.techHints.map((t) => (
        <Badge key={t} variant="outline">
          {t}
        </Badge>
      ))}
    </div>
  );
}

const TONE_CLASS = {
  destructive: 'mt-1.5 text-xs text-destructive',
  warning: 'mt-1.5 text-xs text-warning',
  success: 'mt-1.5 text-xs text-success',
} as const;

function FindingList({ items, tone }: { items: AnalysisItem[]; tone: keyof typeof TONE_CLASS }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">None identified.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="rounded-lg border bg-muted/20 p-3">
          <p className="text-sm font-medium">{item.title}</p>
          {item.detail && (
            <p className="mt-0.5 text-sm text-foreground/80">{item.detail}</p>
          )}
          {item.evidence && (
            <p className={TONE_CLASS[tone]}>Evidence: {item.evidence}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ScrapedPages({ pages }: { pages: LeadAudit['companyPages'] }) {
  if (!pages || pages.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Scraped pages ({pages.length})
      </p>
      {pages.map((p) => (
        <details key={p.url} className="rounded-lg border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm">
            <span className="font-medium">{p.title || p.url}</span>{' '}
            <span className="text-xs text-muted-foreground">
              · {p.wordCount} words
            </span>
          </summary>
          <div className="mt-2 space-y-1.5 text-sm">
            <ExternalA href={p.url}>{p.url}</ExternalA>
            {p.description && (
              <p className="text-xs text-muted-foreground">{p.description}</p>
            )}
            {p.excerpt && (
              <p className="whitespace-pre-wrap border-l-2 pl-3 text-xs text-foreground/70">
                {p.excerpt}
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function RivalCard({ rival }: { rival: Rival }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{rival.name}</p>
          {rival.website && <ExternalA href={rival.website}>{rival.domain || rival.website}</ExternalA>}
        </div>
        {rival.pages.length > 0 ? (
          <Badge variant="success">Verified · {rival.pages.length} pages</Badge>
        ) : (
          <Badge variant="muted">Not scraped</Badge>
        )}
      </div>
      {rival.reason && (
        <p className="mt-2 text-sm text-foreground/80">{rival.reason}</p>
      )}
      {rival.summary && (
        <p className="mt-1.5 text-sm text-muted-foreground">{rival.summary}</p>
      )}
      {rival.signals && (
        <div className="mt-3">
          <SignalChips signals={rival.signals} />
        </div>
      )}
      <ScrapedPages pages={rival.pages} />
    </div>
  );
}

const PRIORITY_VARIANT = {
  high: 'destructive',
  medium: 'warning',
  low: 'muted',
} as const;

// ── the page ───────────────────────────────────────────────────

export function LeadDetailPage({ id, isDark, onToggleTheme, navigate }: Props) {
  const { lead, loading, error } = useLead(id);
  const { audit, runAudit, running } = useLeadAudit(id);

  const isActive = lead ? ACTIVE_LEAD_STATUSES.includes(lead.status) : false;
  const analysis = audit?.analysis ?? null;
  const email = audit?.email ?? null;
  const emailSubject = email?.subject ?? lead?.generatedSubject;
  const emailBody = email?.body ?? lead?.generatedBody;
  const diagnosis = audit ? diagnose(audit) : null;

  return (
    <>
      <Header
        crumb={lead ? fullName(lead) || lead.email : 'Lead'}
        section="Leads"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 animate-fade-in px-6 py-8">
        <button
          type="button"
          onClick={() => navigate({ name: 'leads' })}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All leads
        </button>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {loading && !lead && <Skeleton className="h-72 w-full rounded-xl" />}

        {lead && (
          <div className="space-y-6">
            {/* ── Lead data ─────────────────────────────────── */}
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback
                    className="text-lg text-white"
                    style={{ backgroundImage: avatarGradient(lead.email) }}
                  >
                    {initials(lead)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-semibold">
                    {fullName(lead) || lead.email.split('@')[0]}
                  </h1>
                  <p className="truncate text-sm text-muted-foreground">
                    {lead.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={lead.status} errorMessage={lead.errorMessage} />
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={isActive || running}
                    onClick={runAudit}
                  >
                    {isActive || running ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {audit ? 'Re-run audit' : 'Run audit'}
                  </Button>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field icon={Building2} label="Company" value={lead.company} />
                <Field icon={Briefcase} label="Title" value={lead.title} />
                <Field
                  icon={Globe}
                  label="Website"
                  value={
                    lead.website ? (
                      <ExternalA href={lead.website}>
                        {lead.companyDomain || lead.website}
                      </ExternalA>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field icon={Phone} label="Phone" value={lead.phone} />
                <Field icon={Target} label="Industry" value={lead.industry} />
                <Field icon={MapPin} label="Location" value={lead.location} />
                <Field
                  icon={Megaphone}
                  label="Campaign"
                  value={
                    lead.campaignId && lead.campaignName ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ name: 'campaign', id: lead.campaignId! })
                        }
                        className="font-medium text-primary hover:underline"
                      >
                        {lead.campaignName}
                      </button>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field
                  icon={Mail}
                  label="Sent at"
                  value={lead.sentAt ? new Date(lead.sentAt).toLocaleString() : '—'}
                />
                <Field
                  icon={Clock}
                  label="Added"
                  value={new Date(lead.createdAt).toLocaleString()}
                />
                {lead.status === 'failed' && lead.errorMessage && (
                  <Field
                    icon={AlertTriangle}
                    label="Error"
                    value={
                      <span className="text-destructive">{lead.errorMessage}</span>
                    }
                  />
                )}
              </div>
            </Card>

            {/* ── Diagnosis: why the audit looks the way it does ── */}
            {diagnosis && (
              <div
                className={
                  diagnosis.tone === 'success'
                    ? 'flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3'
                    : diagnosis.tone === 'destructive'
                      ? 'flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3'
                      : 'flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3'
                }
              >
                {diagnosis.tone === 'success' ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : diagnosis.tone === 'destructive' ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{diagnosis.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{diagnosis.detail}</p>
                </div>
                {diagnosis.action === 'settings' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() => navigate({ name: 'settings' })}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    AI providers
                  </Button>
                )}
              </div>
            )}

            {/* ── Pipeline trace ────────────────────────────── */}
            {audit && (
              <Section
                icon={ListChecks}
                title="Audit trace"
                subtitle={
                  audit.status === 'running'
                    ? 'Running — every step appears here as it happens.'
                    : audit.status === 'failed'
                      ? 'Failed — the failing step is expanded below.'
                      : `Completed ${audit.completedAt ? new Date(audit.completedAt).toLocaleString() : ''} · click a stage to see exactly what it did.`
                }
              >
                <AuditTrace audit={audit} />
              </Section>
            )}

            {!audit && !isActive && (
              <Card className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Search className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium">No audit yet</p>
                  <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
                    Run the audit to research {lead.company || 'this company'},
                    discover its rivals, scrape their sites, and generate a
                    personalized email from the findings.
                  </p>
                </div>
                <Button className="mt-1 gap-1.5" onClick={runAudit} disabled={running}>
                  <Play className="h-4 w-4" />
                  Run audit
                </Button>
              </Card>
            )}

            {/* ── Company research ──────────────────────────── */}
            {audit?.company && (
              <Section
                icon={Building2}
                title="Company research"
                subtitle={`${audit.company.name} · ${engineLabel(audit.company.engine)}`}
              >
                <p className="text-sm leading-relaxed text-foreground/90">
                  {audit.company.summary}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {audit.company.positioning && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Positioning
                      </p>
                      <p className="mt-1 text-sm">{audit.company.positioning}</p>
                    </div>
                  )}
                  {audit.company.targetCustomers && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Target customers
                      </p>
                      <p className="mt-1 text-sm">{audit.company.targetCustomers}</p>
                    </div>
                  )}
                </div>
                {(audit.company.products.length > 0 ||
                  audit.company.services.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {audit.company.products.map((p) => (
                      <Badge key={`p-${p}`} variant="default">
                        {p}
                      </Badge>
                    ))}
                    {audit.company.services.map((s) => (
                      <Badge key={`s-${s}`} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {audit.companySignals && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Website signals
                    </p>
                    <SignalChips signals={audit.companySignals} />
                  </div>
                )}
                <ScrapedPages pages={audit.companyPages} />
              </Section>
            )}

            {/* ── Rivals ────────────────────────────────────── */}
            {audit && audit.rivals.length > 0 && (
              <Section
                icon={Swords}
                title="Rivals"
                subtitle={`${audit.rivals.length} competitor${audit.rivals.length === 1 ? '' : 's'} discovered and scraped`}
              >
                <div className="space-y-4">
                  {audit.rivals.map((rival) => (
                    <RivalCard key={rival.domain || rival.name} rival={rival} />
                  ))}
                </div>
              </Section>
            )}

            {/* ── Analysis ──────────────────────────────────── */}
            {analysis && (
              <>
                <Section
                  icon={Sparkles}
                  title="Audit summary"
                  subtitle={engineLabel(analysis.engine)}
                >
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {analysis.summary}
                  </p>
                  {analysis.insights.length > 0 && (
                    <ul className="mt-4 space-y-1.5">
                      {analysis.insights.map((insight, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                          {insight}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section icon={ShieldAlert} title="Weaknesses">
                  <FindingList items={analysis.weaknesses} tone="destructive" />
                </Section>

                {analysis.gaps.length > 0 && (
                  <Section
                    icon={Scale}
                    title="Competitive gaps"
                    subtitle="Things rivals demonstrably do that this company doesn't"
                  >
                    <FindingList items={analysis.gaps} tone="warning" />
                  </Section>
                )}

                <Section icon={TrendingUp} title="Opportunities">
                  <FindingList items={analysis.opportunities} tone="success" />
                </Section>

                {analysis.comparisons.length > 0 && (
                  <Section icon={Scale} title="Head-to-head comparisons">
                    <div className="space-y-4">
                      {analysis.comparisons.map((c) => (
                        <div key={c.rivalName} className="rounded-xl border p-4">
                          <p className="font-medium">
                            {lead.company || 'Company'} vs {c.rivalName}
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-success">
                                {lead.company || 'Company'} advantages
                              </p>
                              <ul className="mt-1.5 space-y-1 text-sm">
                                {c.leadAdvantages.length > 0 ? (
                                  c.leadAdvantages.map((a, i) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                                      {a}
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-muted-foreground">None found</li>
                                )}
                              </ul>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                                {c.rivalName} advantages
                              </p>
                              <ul className="mt-1.5 space-y-1 text-sm">
                                {c.rivalAdvantages.length > 0 ? (
                                  c.rivalAdvantages.map((a, i) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                                      {a}
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-muted-foreground">None found</li>
                                )}
                              </ul>
                            </div>
                          </div>
                          {c.notes && (
                            <p className="mt-3 text-sm text-muted-foreground">{c.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {analysis.recommendations.length > 0 && (
                  <Section icon={ListChecks} title="Recommendations">
                    <ul className="space-y-3">
                      {analysis.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                          <Badge variant={PRIORITY_VARIANT[rec.priority] ?? 'muted'}>
                            {rec.priority}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium">{rec.title}</p>
                            {rec.detail && (
                              <p className="mt-0.5 text-sm text-foreground/80">
                                {rec.detail}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )}

            {/* ── Generated email ───────────────────────────── */}
            {emailBody && (
              <Section
                icon={Mail}
                title="Generated email"
                subtitle={email?.engine ? engineLabel(email.engine) : undefined}
              >
                <div className="rounded-xl border bg-muted/30 p-4">
                  {emailSubject && (
                    <p className="mb-3 border-b pb-3 text-sm font-semibold">
                      {emailSubject}
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90">
                    {emailBody}
                  </pre>
                </div>
              </Section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
