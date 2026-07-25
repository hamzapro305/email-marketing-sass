import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Save,
  Wand2,
  AlertTriangle,
  User,
  PenLine,
  Server,
} from 'lucide-react';
import { api } from '@/api/client';
import type { AiSettingsInput, ComposedEmail, EmailTone } from '@/api/types';
import { useAiSettings } from '@/hooks/useAiSettings';
import { useSmtpAccounts } from '@/hooks/useSmtpAccounts';
import { useLlmAccounts } from '@/hooks/useLlmAccounts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { SmtpAccountsPanel } from '@/components/SmtpAccountsPanel';
import { LlmAccountsPanel } from '@/components/LlmAccountsPanel';

interface Props {
  isDark: boolean;
  onToggleTheme: () => void;
}

const TONES: EmailTone[] = [
  'professional',
  'friendly',
  'casual',
  'concise',
  'persuasive',
];

const selectCls =
  'flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsPage({ isDark, onToggleTheme }: Props) {
  const { settings, loading, error } = useAiSettings();
  const smtp = useSmtpAccounts();
  const llm = useLlmAccounts();
  const [form, setForm] = useState<AiSettingsInput>({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ComposedEmail | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (settings) {
      const {
        hasApiKey,
        apiKeyMasked,
        provider,
        model,
        temperature,
        ...editable
      } = settings;
      // Provider/model/temperature/key now live on LLM accounts, not here.
      void hasApiKey;
      void apiKeyMasked;
      void provider;
      void model;
      void temperature;
      setForm(editable);
    }
  }, [settings]);

  const set = <K extends keyof AiSettingsInput>(k: K, v: AiSettingsInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onError = (m: string) =>
    toast.error('Something went wrong', { description: m });

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAiSettings(form);
      toast.success('Settings saved', {
        description: 'The AI writer will use these on the next send.',
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      await api.updateAiSettings(form); // save first so preview matches the form
      setPreview(await api.previewEmail());
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to generate preview');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <>
      <Header
        crumb="Settings"
        section="Settings"
        isDark={isDark}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 animate-fade-in px-6 py-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect the mailbox you send from, choose the AI that writes, and
            tune how each email reads.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <Tabs defaultValue="email" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="email" className="gap-1.5">
              <Server className="h-3.5 w-3.5" />
              Email
              {!smtp.loading && !smtp.hasAny && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-warning" />
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI providers
            </TabsTrigger>
            <TabsTrigger value="writing" className="gap-1.5">
              <PenLine className="h-3.5 w-3.5" />
              Writing
            </TabsTrigger>
          </TabsList>

          {/* ── Email (SMTP) ── */}
          <TabsContent value="email" className="space-y-6">
            {!smtp.loading && !smtp.hasAny && (
              <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    No SMTP account yet.
                  </span>{' '}
                  Campaigns can't start until a mailbox is connected.
                </p>
              </div>
            )}
            <SmtpAccountsPanel
              accounts={smtp.accounts}
              loading={smtp.loading}
              onChange={smtp.refresh}
            />
          </TabsContent>

          {/* ── AI providers (LLM) ── */}
          <TabsContent value="ai" className="space-y-6">
            <LlmAccountsPanel
              accounts={llm.accounts}
              loading={llm.loading}
              onChange={llm.refresh}
            />
          </TabsContent>

          {/* ── Writing style ── */}
          <TabsContent value="writing" className="space-y-6">
            {loading && !settings ? (
              <Skeleton className="h-96 w-full rounded-xl" />
            ) : (
              settings && (
                <>
                  <Card className="space-y-4 p-5 sm:p-6">
                    <SectionHeader
                      icon={User}
                      title="Sender identity"
                      description="How the AI signs off each email."
                    />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="sname">Your name</Label>
                        <Input
                          id="sname"
                          value={form.senderName ?? ''}
                          onChange={(e) => set('senderName', e.target.value)}
                          placeholder="Alex Rivera"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="srole">Role</Label>
                        <Input
                          id="srole"
                          value={form.senderRole ?? ''}
                          onChange={(e) => set('senderRole', e.target.value)}
                          placeholder="Founder"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="scompany">Company</Label>
                        <Input
                          id="scompany"
                          value={form.senderCompany ?? ''}
                          onChange={(e) => set('senderCompany', e.target.value)}
                          placeholder="Mailflow"
                        />
                      </div>
                    </div>
                  </Card>

                  <Card className="space-y-4 p-5 sm:p-6">
                    <SectionHeader
                      icon={PenLine}
                      title="Writing instructions"
                      description="These instructions drive the AI writer directly — not a fixed prompt."
                    />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="tone">Tone</Label>
                        <select
                          id="tone"
                          className={cn(selectCls, 'capitalize')}
                          value={form.tone ?? 'professional'}
                          onChange={(e) =>
                            set('tone', e.target.value as EmailTone)
                          }
                        >
                          {TONES.map((t) => (
                            <option key={t} value={t} className="capitalize">
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lang">Language</Label>
                        <Input
                          id="lang"
                          value={form.language ?? ''}
                          onChange={(e) => set('language', e.target.value)}
                          placeholder="English"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="words">
                          Word limit ({form.wordLimit ?? 120})
                        </Label>
                        <Input
                          id="words"
                          type="number"
                          min={20}
                          max={500}
                          value={form.wordLimit ?? 120}
                          onChange={(e) =>
                            set('wordLimit', Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cta">Call to action</Label>
                      <Input
                        id="cta"
                        value={form.callToAction ?? ''}
                        onChange={(e) => set('callToAction', e.target.value)}
                        placeholder="a quick 15-minute call"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="instructions">Agent instructions</Label>
                      <Textarea
                        id="instructions"
                        className="min-h-[140px]"
                        value={form.instructions ?? ''}
                        onChange={(e) => set('instructions', e.target.value)}
                        placeholder="e.g. Write a concise, personalized cold email. Open with a specific hook about their company…"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        This is the writer's primary prompt. The default LLM
                        (AI providers tab) generates the subject + body.
                      </p>
                    </div>
                  </Card>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={save} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save settings
                    </Button>
                    <Button
                      variant="outline"
                      onClick={runPreview}
                      disabled={previewing}
                    >
                      {previewing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      Preview email
                    </Button>
                  </div>

                  {preview && (
                    <Card className="p-5 sm:p-6">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Sample email · Jordan Lee (VP of Sales, Northwind)
                      </p>
                      <p className="mb-3 border-b pb-3 text-sm font-semibold">
                        {preview.subject}
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90">
                        {preview.body}
                      </pre>
                    </Card>
                  )}
                </>
              )
            )}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
