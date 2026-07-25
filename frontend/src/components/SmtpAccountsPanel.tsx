import { useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Loader2,
  Star,
  Pencil,
  Trash2,
  Server,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { api } from '@/api/client';
import type { SmtpAccount, SmtpAccountInput } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader } from '@/components/ui/dialog';

interface Props {
  accounts: SmtpAccount[];
  loading: boolean;
  onChange: () => void | Promise<void>;
}

const empty: SmtpAccountInput = {
  label: '',
  host: '',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  fromName: '',
  fromEmail: '',
};

export function SmtpAccountsPanel({ accounts, loading, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SmtpAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onError = (m: string) =>
    toast.error('Something went wrong', { description: m });

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (account: SmtpAccount) => {
    setEditing(account);
    setDialogOpen(true);
  };

  const setDefault = async (account: SmtpAccount) => {
    setBusyId(account._id);
    try {
      await api.setDefaultSmtpAccount(account._id);
      toast.success('Default sender updated', { description: account.label });
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to set default');
    } finally {
      setBusyId(null);
    }
  };

  const test = async (account: SmtpAccount) => {
    setBusyId(account._id);
    try {
      const res = await api.testSmtpAccount(account._id);
      if (res.success) {
        toast.success('Connection OK', { description: account.label });
      } else {
        toast.error('Connection failed', {
          description: res.error ?? 'Could not connect.',
        });
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to test connection');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account: SmtpAccount) => {
    if (
      !window.confirm(
        `Remove "${account.label}"? Campaigns using it will need another sender.`,
      )
    ) {
      return;
    }
    setBusyId(account._id);
    try {
      await api.deleteSmtpAccount(account._id);
      toast('Account removed');
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to remove account');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Server className="h-4 w-4 text-primary" />
            Email accounts (SMTP)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the mailbox(es) campaigns send from. The default account is used
            for every send — you need at least one to start a campaign.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add account
        </Button>
      </div>

      {loading && accounts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No SMTP accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add one to enable sending. For Gmail, use an app password.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {accounts.map((account) => {
            const busy = busyId === account._id;
            return (
              <div
                key={account._id}
                className="flex flex-wrap items-center gap-3 p-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Server className="h-4 w-4" />
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
                    {account.secure && (
                      <Badge variant="muted">
                        <ShieldCheck className="h-3 w-3" />
                        TLS
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.user} · {account.host}:{account.port}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => test(account)}
                    title="Test connection"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
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

      <SmtpAccountDialog
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

function SmtpAccountDialog({
  open,
  account,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  account: SmtpAccount | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (m: string) => void;
}) {
  const isEdit = !!account;
  const [form, setForm] = useState<SmtpAccountInput>(empty);
  const [saving, setSaving] = useState(false);
  // Re-seed the form whenever the dialog opens for a different account.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = account?._id ?? 'new';
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setForm(
      account
        ? {
            label: account.label,
            host: account.host,
            port: account.port,
            secure: account.secure,
            user: account.user,
            pass: '',
            fromName: account.fromName,
            fromEmail: account.fromEmail,
          }
        : empty,
    );
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const set = <K extends keyof SmtpAccountInput>(
    k: K,
    v: SmtpAccountInput[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.label.trim() &&
    form.host.trim() &&
    form.user.trim() &&
    form.port > 0 &&
    (isEdit || (form.pass ?? '').length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const payload: SmtpAccountInput = {
        label: form.label.trim(),
        host: form.host.trim(),
        port: Number(form.port),
        secure: form.secure,
        user: form.user.trim(),
        fromName: form.fromName?.trim() || undefined,
        fromEmail: form.fromEmail?.trim() || undefined,
      };
      if (form.pass) payload.pass = form.pass;

      if (isEdit && account) {
        await api.updateSmtpAccount(account._id, payload);
        toast.success('Account updated', { description: payload.label });
      } else {
        await api.createSmtpAccount({ ...payload, pass: form.pass ?? '' });
        toast.success('Account added', { description: payload.label });
      }
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? () => undefined : onClose}>
      <DialogHeader
        title={isEdit ? 'Edit SMTP account' : 'Add SMTP account'}
        description="Campaigns send through this mailbox. Gmail/Outlook require an app password, not your login password."
      />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="s-label">Label</Label>
          <Input
            id="s-label"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Primary Gmail"
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="s-host">Host</Label>
            <Input
              id="s-host"
              value={form.host}
              onChange={(e) => set('host', e.target.value)}
              placeholder="smtp.gmail.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-port">Port</Label>
            <Input
              id="s-port"
              type="number"
              min={1}
              max={65535}
              className="w-24"
              value={form.port}
              onChange={(e) => set('port', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-secure">TLS</Label>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm">
              <input
                id="s-secure"
                type="checkbox"
                checked={!!form.secure}
                onChange={(e) => {
                  const secure = e.target.checked;
                  set('secure', secure);
                  // Nudge the conventional port for the chosen mode.
                  if (secure && form.port === 587) set('port', 465);
                  if (!secure && form.port === 465) set('port', 587);
                }}
              />
              <span className="text-muted-foreground">465</span>
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s-user">Username</Label>
            <Input
              id="s-user"
              value={form.user}
              onChange={(e) => set('user', e.target.value)}
              placeholder="you@company.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-pass">
              Password{isEdit ? ' (leave blank to keep)' : ''}
            </Label>
            <Input
              id="s-pass"
              type="password"
              value={form.pass ?? ''}
              onChange={(e) => set('pass', e.target.value)}
              placeholder={
                isEdit && account?.hasPass ? '•••••••• saved' : 'app password'
              }
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="s-fromname">From name (optional)</Label>
            <Input
              id="s-fromname"
              value={form.fromName ?? ''}
              onChange={(e) => set('fromName', e.target.value)}
              placeholder="Alex from Mailflow"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-fromemail">From email (optional)</Label>
            <Input
              id="s-fromemail"
              type="email"
              value={form.fromEmail ?? ''}
              onChange={(e) => set('fromEmail', e.target.value)}
              placeholder="defaults to username"
            />
          </div>
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
            {isEdit ? 'Save changes' : 'Add account'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
