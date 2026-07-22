import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedLeadRow {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
}

export interface ParseResult {
  rows: ParsedLeadRow[];
  skipped: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes a header cell so tolerant matching works regardless of casing,
 * spacing, or punctuation. "First Name", "first_name", "FIRSTNAME" all collapse
 * to "firstname".
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Known Apollo (and generic) header variations mapped to our canonical fields.
const HEADER_ALIASES: Record<keyof ParsedLeadRow, string[]> = {
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

/**
 * Builds a map from a row's raw header -> canonical field name.
 */
function buildFieldMap(headers: string[]): Map<string, keyof ParsedLeadRow> {
  const map = new Map<string, keyof ParsedLeadRow>();
  for (const raw of headers) {
    const norm = normalizeHeader(raw);
    for (const field of Object.keys(HEADER_ALIASES) as (keyof ParsedLeadRow)[]) {
      if (HEADER_ALIASES[field].includes(norm)) {
        // First matching header wins for a given field.
        if (![...map.values()].includes(field)) {
          map.set(raw, field);
        }
        break;
      }
    }
  }
  return map;
}

function coerce(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Converts an array of raw record objects (header -> cell) into validated
 * canonical rows, dropping any row without a valid email.
 */
function mapRecords(records: Record<string, unknown>[]): ParseResult {
  if (records.length === 0) return { rows: [], skipped: 0 };

  const headers = Object.keys(records[0]);
  const fieldMap = buildFieldMap(headers);

  const rows: ParsedLeadRow[] = [];
  let skipped = 0;

  for (const record of records) {
    const out: ParsedLeadRow = {
      email: '',
      firstName: '',
      lastName: '',
      company: '',
      title: '',
    };

    for (const [rawHeader, field] of fieldMap.entries()) {
      out[field] = coerce(record[rawHeader]);
    }

    out.email = out.email.toLowerCase();

    if (!EMAIL_RE.test(out.email)) {
      skipped += 1;
      continue;
    }
    rows.push(out);
  }

  return { rows, skipped };
}

/** Parse a CSV buffer into canonical rows. */
export function parseCsv(buffer: Buffer): ParseResult {
  const text = buffer.toString('utf8');
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return mapRecords((result.data ?? []).filter(Boolean));
}

/** Parse an XLSX/XLS buffer (first sheet) into canonical rows. */
export function parseXlsx(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], skipped: 0 };
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return mapRecords(records);
}

/** Dispatch on file name / mimetype to the right parser. */
export function parseFile(
  filename: string,
  mimetype: string,
  buffer: Buffer,
): ParseResult {
  const lower = (filename || '').toLowerCase();
  const isXlsx =
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    mimetype.includes('spreadsheetml') ||
    mimetype.includes('ms-excel');
  return isXlsx ? parseXlsx(buffer) : parseCsv(buffer);
}
