import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedLeadRow {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  website: string;
  phone: string;
  industry: string;
  location: string;
  linkedinUrl: string;
  /** Derived: research cache key (website domain, else business email domain). */
  companyDomain: string;
}

export interface ParseResult {
  rows: ParsedLeadRow[];
  /** Rows dropped for having no valid email. */
  skipped: number;
  /** Rows dropped as duplicates (same email) within this file. */
  duplicates: number;
  /** Structural problems worth surfacing (ragged rows, no website column…). */
  warnings: string[];
}

// PapaParse files a row's surplus cells (more values than headers) here.
const EXTRA_KEY = '__parsed_extra';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Personal mailbox providers — their domain says nothing about the company, so
// it must never become a research key.
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.de', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru',
  'fastmail.com', 'hey.com', 'pm.me', 'qq.com', '163.com', '126.com',
]);

/**
 * Normalizes a header cell so tolerant matching works regardless of casing,
 * spacing, or punctuation. "First Name", "first_name", "FIRSTNAME" all collapse
 * to "firstname".
 */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type MappedField = Exclude<keyof ParsedLeadRow, 'companyDomain'>;

// Known Apollo (and generic) header variations mapped to our canonical fields.
const HEADER_ALIASES: Record<MappedField, string[]> = {
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
  website: [
    'website',
    'companywebsite',
    'websiteurl',
    'site',
    'domain',
    'companydomain',
    'url',
    'web',
  ],
  phone: [
    'phone',
    'phonenumber',
    'workphone',
    'mobile',
    'mobilephone',
    'telephone',
    'directphone',
    'corporatephone',
  ],
  industry: ['industry', 'sector', 'vertical'],
  location: [
    'location',
    'city',
    'country',
    'region',
    'state',
    'companycity',
    'companycountry',
  ],
  linkedinUrl: [
    'linkedin',
    'linkedinurl',
    'linkedinprofile',
    'personlinkedinurl',
    'companylinkedinurl',
  ],
};

/** Builds a map from a row's raw header -> canonical field name. */
function buildFieldMap(headers: string[]): Map<string, MappedField> {
  const map = new Map<string, MappedField>();
  const claimed = new Set<MappedField>();
  for (const raw of headers) {
    const norm = normalizeHeader(raw);
    for (const field of Object.keys(HEADER_ALIASES) as MappedField[]) {
      // First matching header wins for a given field.
      if (!claimed.has(field) && HEADER_ALIASES[field].includes(norm)) {
        map.set(raw, field);
        claimed.add(field);
        break;
      }
    }
  }
  return map;
}

function coerce(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** "example.com" from a URL-ish or domain-ish cell; '' when unparseable. */
export function extractDomain(input: string): string {
  const raw = (input || '').trim().toLowerCase();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./, '');
    // Require at least one dot so junk like "n/a" doesn't become a domain.
    return host.includes('.') ? host : '';
  } catch {
    return '';
  }
}

/** Canonical website URL for a domain-ish/URL-ish cell; '' when unparseable. */
export function normalizeWebsite(input: string): string {
  const domain = extractDomain(input);
  if (!domain) return '';
  const raw = (input || '').trim().toLowerCase();
  const scheme = raw.startsWith('http://') ? 'http://' : 'https://';
  return `${scheme}${domain}`;
}

/** The research-cache key for a lead: website domain, else work-email domain. */
export function deriveCompanyDomain(email: string, website: string): string {
  const fromWebsite = extractDomain(website);
  if (fromWebsite && !FREE_MAIL_DOMAINS.has(fromWebsite)) return fromWebsite;
  const emailDomain = (email.split('@')[1] ?? '').toLowerCase();
  if (emailDomain && !FREE_MAIL_DOMAINS.has(emailDomain)) return emailDomain;
  return '';
}

/**
 * Converts an array of raw record objects (header -> cell) into validated,
 * normalized canonical rows: rows without a valid email are dropped, and rows
 * repeating an email already seen in this file are dropped as duplicates.
 */
function mapRecords(records: Record<string, unknown>[]): ParseResult {
  if (records.length === 0) {
    return { rows: [], skipped: 0, duplicates: 0, warnings: [] };
  }

  const headers = Object.keys(records[0]).filter((h) => h !== EXTRA_KEY);
  const fieldMap = buildFieldMap(headers);

  const rows: ParsedLeadRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  let ragged = 0;

  for (const record of records) {
    const extra = record[EXTRA_KEY];
    if (Array.isArray(extra) && extra.length > 0) ragged += 1;
    const out: ParsedLeadRow = {
      email: '',
      firstName: '',
      lastName: '',
      company: '',
      title: '',
      website: '',
      phone: '',
      industry: '',
      location: '',
      linkedinUrl: '',
      companyDomain: '',
    };

    for (const [rawHeader, field] of fieldMap.entries()) {
      out[field] = coerce(record[rawHeader]);
    }

    out.email = out.email.toLowerCase();
    if (!EMAIL_RE.test(out.email)) {
      skipped += 1;
      continue;
    }
    if (seen.has(out.email)) {
      duplicates += 1;
      continue;
    }
    seen.add(out.email);

    out.website = normalizeWebsite(out.website);
    out.companyDomain = deriveCompanyDomain(out.email, out.website);
    // A domain-only website column still gives us a usable website URL.
    if (!out.website && out.companyDomain) {
      out.website = `https://${out.companyDomain}`;
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
  const unresearchable = rows.filter((r) => !r.companyDomain).length;
  if (unresearchable > 0) {
    const hasWebsiteColumn = [...fieldMap.values()].includes('website');
    warnings.push(
      `${unresearchable} lead${unresearchable === 1 ? ' uses' : 's use'} a personal email ` +
        (hasWebsiteColumn ? 'with an empty Website cell' : 'and the file has no Website column') +
        '. Without a company website there is nothing to research, so the audit will be empty.',
    );
  }

  return { rows, skipped, duplicates, warnings };
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
  if (!sheetName) return { rows: [], skipped: 0, duplicates: 0, warnings: [] };
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
