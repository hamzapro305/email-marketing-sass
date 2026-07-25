import { useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { api } from '@/api/client';
import type { Campaign } from '@/api/types';
import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
  onError: (message: string) => void;
}

export function CreateCampaignDialog({
  open,
  onClose,
  onCreated,
  onError,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setDescription('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const campaign = await api.createCampaign({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      reset();
      onCreated(campaign);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? () => {} : onClose}>
      <DialogHeader
        title="New campaign"
        description="Name it and tell the AI what you're offering. It writes a unique subject and email for every lead. You'll add leads on the next screen."
      />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Campaign name</Label>
          <Input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q3 outreach — Enterprise"
            autoFocus
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-desc">What are you offering? (optional)</Label>
          <Textarea
            id="c-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. We help B2B teams book more demos with AI-personalized cold email…"
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground">
            The AI uses this as context to personalize the subject and body of
            every email. Leave blank for a generic outreach.
          </p>
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
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {saving ? 'Creating…' : 'Create campaign'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
