import { useMemo, useState } from 'react';
import {
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import type { Lead } from '../api/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  leads: Lead[];
  loading?: boolean;
}

const ROWS_PER_PAGE = 8;

function fullName(lead: Lead): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return name || '—';
}

export function LeadTable({ leads, loading }: Props) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(leads.length / ROWS_PER_PAGE));
  const current = Math.min(page, pages);

  const items = useMemo(() => {
    const start = (current - 1) * ROWS_PER_PAGE;
    return leads.slice(start, start + ROWS_PER_PAGE);
  }, [leads, current]);

  const columns = [
    { key: 'email', label: 'EMAIL' },
    { key: 'name', label: 'NAME' },
    { key: 'company', label: 'COMPANY' },
    { key: 'title', label: 'TITLE' },
    { key: 'status', label: 'STATUS' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Table
        aria-label="Imported leads"
        removeWrapper
        classNames={{
          th: 'bg-default-100 text-default-600 text-xs',
          td: 'py-3',
        }}
        bottomContent={
          pages > 1 && !loading ? (
            <div className="flex justify-end">
              <Pagination
                showControls
                size="sm"
                color="primary"
                page={current}
                total={pages}
                onChange={setPage}
              />
            </div>
          ) : null
        }
      >
        <TableHeader columns={columns}>
          {(col) => <TableColumn key={col.key}>{col.label}</TableColumn>}
        </TableHeader>
        <TableBody emptyContent="No leads to display.">
          {loading
            ? (Array.from({ length: ROWS_PER_PAGE }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-40 rounded-md" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28 rounded-md" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32 rounded-md" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24 rounded-md" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                </TableRow>
              )) as never)
            : items.map((lead) => (
                <TableRow key={lead._id}>
                  <TableCell className="font-medium">{lead.email}</TableCell>
                  <TableCell>{fullName(lead)}</TableCell>
                  <TableCell>{lead.company || '—'}</TableCell>
                  <TableCell>{lead.title || '—'}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={lead.status}
                      errorMessage={lead.errorMessage}
                    />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
