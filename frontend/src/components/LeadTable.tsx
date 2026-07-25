import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Lead, LeadStatus } from '@/api/types';
import { avatarGradient, fullName, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from './StatusBadge';

interface Props {
  leads: Lead[];
  loading?: boolean;
  /** Show a column with each lead's campaign name (for the all-leads view). */
  showCampaign?: boolean;
  /** Make rows clickable (e.g. to open the lead detail page). */
  onRowClick?: (lead: Lead) => void;
}

const ROWS_PER_PAGE = 7;
type Filter = 'all' | 'pending' | 'active' | 'sent' | 'failed';

/** Live, in-flight run states grouped under a single "In progress" filter. */
const ACTIVE_STATUSES: LeadStatus[] = ['queued', 'writing', 'sending'];

function LeadAvatar({ lead }: { lead: Lead }) {
  return (
    <Avatar>
      <AvatarFallback
        className="text-white"
        style={{ backgroundImage: avatarGradient(lead.email) }}
      >
        {initials(lead)}
      </AvatarFallback>
    </Avatar>
  );
}

export function LeadTable({
  leads,
  loading,
  showCampaign,
  onRowClick,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: leads.length,
      pending: 0,
      active: 0,
      sent: 0,
      failed: 0,
    };
    for (const l of leads) {
      if (l.status === 'sent') c.sent += 1;
      else if (l.status === 'failed') c.failed += 1;
      else if (l.status === 'pending') c.pending += 1;
      else c.active += 1; // queued | writing | sending
    }
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (status: LeadStatus): boolean => {
      if (filter === 'all') return true;
      if (filter === 'active') return ACTIVE_STATUSES.includes(status);
      return status === filter;
    };
    return leads.filter((l) => {
      if (!matches(l.status)) return false;
      if (!q) return true;
      return (
        l.email.toLowerCase().includes(q) ||
        fullName(l).toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q) ||
        (l.title || '').toLowerCase().includes(q)
      );
    });
  }, [leads, filter, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const current = Math.min(page, pages);
  useEffect(() => setPage(1), [filter, query]);

  const items = useMemo(() => {
    const start = (current - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, current]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, company…"
            className="pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All · {counts.all}</TabsTrigger>
            <TabsTrigger value="pending">Pending · {counts.pending}</TabsTrigger>
            <TabsTrigger value="active">In progress · {counts.active}</TabsTrigger>
            <TabsTrigger value="sent">Sent · {counts.sent}</TabsTrigger>
            <TabsTrigger value="failed">Failed · {counts.failed}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Lead</TableHead>
              <TableHead>Company</TableHead>
              {showCampaign ? (
                <TableHead>Campaign</TableHead>
              ) : (
                <TableHead>Title</TableHead>
              )}
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: ROWS_PER_PAGE }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-2.5 w-40" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No leads match your filters.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((lead) => (
                <TableRow
                  key={lead._id}
                  onClick={onRowClick ? () => onRowClick(lead) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <LeadAvatar lead={lead} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {fullName(lead) || lead.email.split('@')[0]}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lead.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.company || '—'}
                  </TableCell>
                  {showCampaign ? (
                    <TableCell className="text-muted-foreground">
                      {lead.campaignName || '—'}
                    </TableCell>
                  ) : (
                    <TableCell className="text-muted-foreground">
                      {lead.title || '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <StatusBadge
                        status={lead.status}
                        errorMessage={lead.errorMessage}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer / pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {items.length} of {filtered.length}
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={current === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm tabular-nums text-muted-foreground">
                {current} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className={cn('h-8 w-8')}
                disabled={current === pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
