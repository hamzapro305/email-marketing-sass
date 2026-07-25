import {
  ArrowLeft,
  Building2,
  Briefcase,
  Mail,
  Megaphone,
  AlertTriangle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useLead } from '@/hooks/useLead';
import { fullName, initials, avatarGradient } from '@/lib/format';
import type { Route } from '@/lib/nav';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Header } from '@/components/layout/Header';
import { StatusBadge } from '@/components/StatusBadge';

interface Props {
  id: string;
  isDark: boolean;
  onToggleTheme: () => void;
  navigate: (route: Route) => void;
}

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

export function LeadDetailPage({ id, isDark, onToggleTheme, navigate }: Props) {
  const { lead, loading, error } = useLead(id);

  return (
    <>
      <Header
        crumb={lead ? fullName(lead) || lead.email : 'Lead'}
        section="Leads"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 animate-fade-in px-6 py-8">
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

        {loading && !lead && (
          <Skeleton className="h-72 w-full rounded-xl" />
        )}

        {lead && (
          <Card className="p-6">
            {/* Identity */}
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
              <StatusBadge status={lead.status} errorMessage={lead.errorMessage} />
            </div>

            <Separator className="my-6" />

            {/* Fields */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field icon={Building2} label="Company" value={lead.company} />
              <Field icon={Briefcase} label="Title" value={lead.title} />
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
                value={
                  lead.sentAt ? new Date(lead.sentAt).toLocaleString() : '—'
                }
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

            {/* AI-written email */}
            {lead.generatedBody && (
              <>
                <Separator className="my-6" />
                <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI-written email
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  {lead.generatedSubject && (
                    <p className="mb-3 border-b pb-3 text-sm font-semibold">
                      {lead.generatedSubject}
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90">
                    {lead.generatedBody}
                  </pre>
                </div>
              </>
            )}
          </Card>
        )}
      </main>
    </>
  );
}
