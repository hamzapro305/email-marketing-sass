import { useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  Star,
  Pencil,
  Trash2,
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import { api } from '@/api/client';
import type { LlmAccount, LlmAccountInput, LlmProvider } from '@/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader } from '@/components/ui/dialog';

interface Props {
  accounts: LlmAccount[];
  loading: boolean;
  onChange: () => void | Promise<void>;
}

interface ProviderMeta {
  label: string;
  defaultModel: string;
  needsKey: boolean;
  needsBase: boolean;
  /** Shows an optional base URL field (placeholder = the default). */
  optionalBase?: string;
  keyHint: string;
  modelHint: string;
}

const PROVIDERS: Record<LlmProvider, ProviderMeta> = {
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    needsKey: true,
    needsBase: false,
    keyHint: 'Key from aistudio.google.com/apikey',
    modelHint: 'e.g. gemini-2.0-flash',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    needsBase: false,
    keyHint: 'Key from platform.openai.com',
    modelHint: 'e.g. gpt-4o-mini',
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    defaultModel: 'kimi-k2.6',
    needsKey: true,
    needsBase: false,
    optionalBase: 'https://api.moonshot.ai/v1',
    keyHint: 'Key from platform.moonshot.ai',
    modelHint: 'e.g. kimi-k2.6 / kimi-k3 / moonshot-v1-32k',
  },
  ollama: {
    label: 'Ollama (local)',
    defaultModel: 'llama3.2',
    needsKey: false,
    needsBase: true,
    keyHint: '',
    modelHint: 'e.g. llama3.2 / llama3.1',
  },
};

const PROVIDER_ORDER: LlmProvider[] = ['gemini', 'openai', 'kimi', 'ollama'];

const emptyFor = (provider: LlmProvider): LlmAccountInput => ({
  label: '',
  provider,
  model: PROVIDERS[provider].defaultModel,
  apiKey: '',
  apiBase: provider === 'ollama' ? 'http://localhost:11434' : '',
  temperature: 0.7,
});

export function LlmAccountsPanel({ accounts, loading, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LlmAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onError = (m: string) =>
    toast.error('Something went wrong', { description: m });

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (account: LlmAccount) => {
    setEditing(account);
    setDialogOpen(true);
  };

  const setDefault = async (account: LlmAccount) => {
    setBusyId(account._id);
    try {
      await api.setDefaultLlmAccount(account._id);
      toast.success('Default model updated', { description: account.label });
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to set default');
    } finally {
      setBusyId(null);
    }
  };

  const test = async (account: LlmAccount) => {
    setBusyId(account._id);
    try {
      const res = await api.testLlmAccount(account._id);
      if (res.success) {
        toast.success('LLM works', {
          description: `${account.label}${res.engine ? ` · ${res.engine}` : ''}`,
        });
      } else {
        toast.error('LLM test failed', {
          description: res.error ?? 'Could not generate.',
        });
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to test LLM');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account: LlmAccount) => {
    if (!window.confirm(`Remove "${account.label}"?`)) return;
    setBusyId(account._id);
    try {
      await api.deleteLlmAccount(account._id);
      toast('Model removed');
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to remove model');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            AI providers (LLM)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the model that writes each email. The default is used for every
            campaign. No provider? The app uses a built-in writer as fallback.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add provider
        </Button>
      </div>

      {loading && accounts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading providers…
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No AI providers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add Gemini, OpenAI, Kimi, or Ollama to write real, personalized emails.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {accounts.map((account) => {
            const busy = busyId === account._id;
            const meta = PROVIDERS[account.provider];
            return (
              <div
                key={account._id}
                className="flex flex-wrap items-center gap-3 p-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {account.label}
                    </p>
                    {account.isDefault && (
                      <Badge variant="success">
                        <Star className="h-3 w-3" />
                        Default
                      </Badge>
                    )}
                    <Badge variant="muted">{meta?.label ?? account.provider}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.model} · temp {account.temperature}
                    {account.provider === 'ollama' && account.apiBase
                      ? ` · ${account.apiBase}`
                      : account.hasApiKey
                        ? ` · key ${account.apiKeyMasked}`
                        : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => test(account)}
                    title="Test this model"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FlaskConical className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Test</span>
                  </Button>
                  {!account.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDefault(account)}
                      title="Make default"
                    >
                      <Star className="h-4 w-4" />
                      <span className="hidden sm:inline">Default</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={busy}
                    onClick={() => openEdit(account)}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => remove(account)}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LlmAccountDialog
        open={dialogOpen}
        account={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          setDialogOpen(false);
          await onChange();
        }}
        onError={onError}
      />
    </Card>
  );
}

function LlmAccountDialog({
  open,
  account,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  account: LlmAccount | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const isEdit = !!account;
  const [form, setForm] = useState<LlmAccountInput>(emptyFor('gemini'));
  const [saving, setSaving] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = account?._id ?? 'new';
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setForm(
      account
        ? {
            label: account.label,
            provider: account.provider,
            model: account.model,
            apiKey: '',
            apiBase: account.apiBase,
            temperature: account.temperature,
          }
        : emptyFor('gemini'),
    );
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const meta = PROVIDERS[form.provider];

  const set = <K extends keyof LlmAccountInput>(k: K, v: LlmAccountInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const changeProvider = (provider: LlmProvider) => {
    setForm((f) => ({
      ...f,
      provider,
      // Seed a sensible default model/base when switching provider, unless the
      // user already typed a custom model.
      model:
        !f.model || Object.values(PROVIDERS).some((p) => p.defaultModel === f.model)
          ? PROVIDERS[provider].defaultModel
          : f.model,
      // Base URLs are provider-specific — never carry one across providers.
      apiBase:
        provider === f.provider
          ? f.apiBase
          : provider === 'ollama'
            ? 'http://localhost:11434'
            : '',
    }));
  };

  const valid =
    form.label.trim() &&
    form.model.trim() &&
    (!meta.needsKey || isEdit || (form.apiKey ?? '').length > 0) &&
    (!meta.needsBase || (form.apiBase ?? '').trim().length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const payload: LlmAccountInput = {
        label: form.label.trim(),
        provider: form.provider,
        model: form.model.trim(),
        temperature: Number(form.temperature),
        apiBase:
          meta.needsBase || meta.optionalBase
            ? form.apiBase?.trim()
            : undefined,
      };
      if (form.apiKey) payload.apiKey = form.apiKey;

      if (isEdit && account) {
        await api.updateLlmAccount(account._id, payload);
        toast.success('Provider updated', { description: payload.label });
      } else {
        await api.createLlmAccount(payload);
        toast.success('Provider added', { description: payload.label });
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? () => undefined : onClose}>
      <DialogHeader
        title={isEdit ? 'Edit AI provider' : 'Add AI provider'}
        description="Pick a provider and model. Gemini/OpenAI/Kimi need an API key; Ollama runs locally with a base URL."
      />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Provider</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROVIDER_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changeProvider(p)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  form.provider === p
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-muted/50',
                )}
              >
                {PROVIDERS[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="l-label">Label</Label>
            <Input
              id="l-label"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Gemini Flash"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-model">Model</Label>
            <Input
              id="l-model"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder={meta.modelHint}
            />
          </div>
        </div>

        {meta.needsKey && (
          <div className="space-y-1.5">
            <Label htmlFor="l-key">
              API key{isEdit ? ' (leave blank to keep)' : ''}
            </Label>
            <Input
              id="l-key"
              type="password"
              value={form.apiKey ?? ''}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder={
                isEdit && account?.hasApiKey
                  ? `Saved: ${account.apiKeyMasked} — type to replace`
                  : meta.keyHint
              }
              autoComplete="new-password"
            />
          </div>
        )}

        {meta.optionalBase && (
          <div className="space-y-1.5">
            <Label htmlFor="l-base">Base URL (optional)</Label>
            <Input
              id="l-base"
              value={form.apiBase ?? ''}
              onChange={(e) => set('apiBase', e.target.value)}
              placeholder={meta.optionalBase}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for the international API. China-region keys need
              https://api.moonshot.cn/v1.
            </p>
          </div>
        )}

        {meta.needsBase && (
          <div className="space-y-1.5">
            <Label htmlFor="l-base">Ollama base URL</Label>
            <Input
              id="l-base"
              value={form.apiBase ?? ''}
              onChange={(e) => set('apiBase', e.target.value)}
              placeholder="http://localhost:11434"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="l-temp">Temperature ({form.temperature ?? 0.7})</Label>
          <input
            id="l-temp"
            type="range"
            min={0}
            max={2}
            step={0.1}
            className="w-full accent-primary"
            value={form.temperature ?? 0.7}
            onChange={(e) => set('temperature', Number(e.target.value))}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !valid}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isEdit ? 'Save changes' : 'Add provider'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
