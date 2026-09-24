import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedLead } from './types';

export interface LocalParseResult {
  rows: ParsedLead[];
  skipped: number;
  /** Structural problems worth fixing before import (ragged rows, no website column…). */
  warnings: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the backend list: a lead at one of these can only be researched if
// the file also supplies a website.
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.de', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru',
  'fastmail.com', 'hey.com', 'pm.me', 'qq.com', '163.com', '126.com',
]);

// PapaParse files a row's surplus cells (more values than headers) here.
const EXTRA_KEY = '__parsed_extra';

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
  website: ['website', 'companywebsite', 'websiteurl', 'site', 'domain', 'companydomain', 'url', 'web'],
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
  if (records.length === 0) return { rows: [], skipped: 0, warnings: [] };
  const headers = Object.keys(records[0]).filter((h) => h !== EXTRA_KEY);
  const fieldMap = buildFieldMap(headers);

  const rows: ParsedLead[] = [];
  let skipped = 0;
  let ragged = 0;

  for (const record of records) {
    if (Array.isArray(record[EXTRA_KEY]) && record[EXTRA_KEY].length > 0) ragged += 1;
    const out: ParsedLead = {
      email: '',
      firstName: '',
      lastName: '',
      company: '',
      title: '',
      website: '',
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

  const warnings: string[] = [];
  if (ragged > 0) {
    warnings.push(
      `${ragged} row${ragged === 1 ? ' has' : 's have'} more values than the header row ` +
        `(${headers.length} column${headers.length === 1 ? '' : 's'}: ${headers.join(', ')}). ` +
        'The extra values were ignored — add the missing column names to the first line.',
    );
  }
  const hasWebsiteColumn = [...fieldMap.values()].includes('website');
  const personal = rows.filter(
    (r) => !r.website && FREE_MAIL.has(r.email.split('@')[1] ?? ''),
  ).length;
  if (personal > 0) {
    warnings.push(
      `${personal} lead${personal === 1 ? ' uses' : 's use'} a personal email (gmail, outlook…) ` +
        (hasWebsiteColumn ? 'with an empty Website cell' : 'and the file has no Website column') +
        '. Without a company website there is nothing to research, so the audit will be empty.',
    );
  }
  return { rows, skipped, warnings };
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
    if (!sheetName) return { rows: [], skipped: 0, warnings: [] };
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
