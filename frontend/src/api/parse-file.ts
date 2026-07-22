import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedLead } from './types';

export interface LocalParseResult {
  rows: ParsedLead[];
  skipped: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_ALIASES: Record<keyof ParsedLead, string[]> = {
  email: ['email', 'emailaddress', 'workemail', 'primaryemail', 'contactemail'],
  firstName: ['firstname', 'first', 'givenname', 'fname'],
  lastName: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  company: [
    'company',
    'companyname',
    'organization',
    'organisation',
    'account',
    'accountname',
    'employer',
  ],
  title: ['title', 'jobtitle', 'position', 'role', 'headline'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildFieldMap(headers: string[]): Map<string, keyof ParsedLead> {
  const map = new Map<string, keyof ParsedLead>();
  for (const raw of headers) {
    const norm = normalizeHeader(raw);
    for (const field of Object.keys(HEADER_ALIASES) as (keyof ParsedLead)[]) {
      if (HEADER_ALIASES[field].includes(norm)) {
        if (![...map.values()].includes(field)) map.set(raw, field);
        break;
      }
    }
  }
  return map;
}

function mapRecords(records: Record<string, unknown>[]): LocalParseResult {
  if (records.length === 0) return { rows: [], skipped: 0 };
  const fieldMap = buildFieldMap(Object.keys(records[0]));

  const rows: ParsedLead[] = [];
  let skipped = 0;

  for (const record of records) {
    const out: ParsedLead = {
      email: '',
      firstName: '',
      lastName: '',
      company: '',
      title: '',
    };
    for (const [rawHeader, field] of fieldMap.entries()) {
      const v = record[rawHeader];
      out[field] = v === null || v === undefined ? '' : String(v).trim();
    }
    out.email = (out.email ?? '').toLowerCase();

    if (!EMAIL_RE.test(out.email ?? '')) {
      skipped += 1;
      continue;
    }
    rows.push(out);
  }
  return { rows, skipped };
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/** Parse a CSV or XLSX File in the browser, returning tolerant-mapped rows. */
export async function parseLeadFile(file: File): Promise<LocalParseResult> {
  const name = file.name.toLowerCase();
  const isXlsx =
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type.includes('spreadsheetml') ||
    file.type.includes('ms-excel');

  if (isXlsx) {
    const buf = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { rows: [], skipped: 0 };
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
      { defval: '', raw: false },
    );
    return mapRecords(records);
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return mapRecords((parsed.data ?? []).filter(Boolean));
}
