/**
 * Outbound email text hygiene.
 *
 * En dashes (–) and em dashes (—) read as machine-written in cold outreach,
 * and models use them no matter what the prompt says, so every email is
 * passed through this before it is stored or sent. Replacements aim to read
 * as a person would have written the sentence:
 *
 *   "10–20 seats"          → "10-20 seats"      (ranges keep a hyphen)
 *   "Hi Hamza —"           → "Hi Hamza,"        (trailing dash → comma)
 *   "— Hamza"              → "Hamza"            (leading dash dropped)
 *   "the gap — it matters" → "the gap, it matters"
 *   "hub—unusual"          → "hub, unusual"
 *   "call? — let me know"  → "call? Let me know" (after a sentence end)
 *
 * Subjects get a colon instead: "Webflow — developer gap" → "Webflow: developer gap".
 */
const DASH = '[\\u2013\\u2014]';

export function stripDashes(text: string): string {
  if (!text || !/[–—]/.test(text)) return text;
  return (
    text
      // Numeric/date ranges: 10–20, 2024–2025.
      .replace(new RegExp(`(\\d)\\s*${DASH}\\s*(\\d)`, 'g'), '$1-$2')
      // A dash opening a line (sign-offs, bullets, separators) is dropped.
      .replace(new RegExp(`^[ \\t]*${DASH}+[ \\t]*`, 'gm'), '')
      // After a sentence end the dash is redundant; start the next sentence.
      .replace(
        new RegExp(`([.!?])[ \\t]*${DASH}+[ \\t]*(\\S)`, 'g'),
        (_m, end: string, next: string) => `${end} ${next.toUpperCase()}`,
      )
      // A dash closing a line ("Hi Hamza —") becomes a comma.
      .replace(new RegExp(`[ \\t]*${DASH}+[ \\t]*$`, 'gm'), ',')
      // Any remaining dash joins two clauses: use a comma.
      .replace(new RegExp(`[ \\t]*${DASH}+[ \\t]*`, 'g'), ', ')
      // Tidy punctuation the substitutions may have produced.
      .replace(/,\s*,/g, ',')
      .replace(/,(\s*[.!?;:])/g, '$1')
      .replace(/([.!?;:]),/g, '$1')
      .replace(/^,\s*$/gm, '')
      .replace(/[ \t]{2,}/g, ' ')
  );
}

/** Subject + body of an email, cleaned for sending. */
export function cleanEmail<T extends { subject: string; body: string }>(email: T): T {
  return {
    ...email,
    subject: stripDashes(
      email.subject.replace(new RegExp(`\\s+${DASH}+\\s+`, 'g'), ': '),
    ).replace(/,\s*$/, ''),
    body: stripDashes(email.body),
  };
}
