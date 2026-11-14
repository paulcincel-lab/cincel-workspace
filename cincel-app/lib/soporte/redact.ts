/**
 * Redaction before a solicitud goes to the public GitHub repository (#1116).
 * It pre-cleans the text; an admin still reviews it and ticks the checklist.
 */

/** What the redaction knows about the app: names to replace with a placeholder. */
export type RedactionContext = {
  staffNames: string[];
  contactNames: string[];
  clientNames: string[];
  projectNames: string[];
  /** Hosts of the app itself (`cincel-app.example.com`): their URLs keep only the path. */
  appHosts?: string[];
};

export type RedactionResult = { text: string; changed: boolean };

export const REDACTED_EMAIL = "[correo]";
export const REDACTED_PHONE = "[teléfono]";
export const REDACTED_PERSON = "[persona]";
export const REDACTED_CLIENT = "[cliente]";
export const REDACTED_PROJECT = "[proyecto]";
export const REDACTED_LINK = "[enlace]";
export const REDACTED_ID = ":id";

const MIN_NAME_LENGTH = 3;
/** A single word of a person's name is replaced on its own from this length. */
const MIN_NAME_WORD_LENGTH = 4;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE_CANDIDATE_RE = /[+(]?\d[\d\s().-]{6,}\d/g;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A pattern for the name that tolerates extra spaces and never matches inside a longer word. */
function namePattern(name: string): RegExp {
  const body = escapeRegExp(name).replace(/ /g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "giu");
}

function uniqueByLength(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    const key = name.toLocaleLowerCase("es");
    if (name.length < MIN_NAME_LENGTH || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Full names first, then each word of a person's name that is long enough to be a name on its own. */
function personTerms(names: string[]): string[] {
  const terms: string[] = [];
  for (const name of uniqueByLength(names)) {
    terms.push(name);
    for (const word of name.split(" ")) {
      if (word.length >= MIN_NAME_WORD_LENGTH) terms.push(word);
    }
  }
  return uniqueByLength(terms);
}

function replaceNames(text: string, names: string[], placeholder: string): string {
  let out = text;
  for (const name of names) out = out.replace(namePattern(name), placeholder);
  return out;
}

function redactUrl(raw: string, hosts: Set<string>): string {
  // Trailing punctuation belongs to the sentence, not to the link.
  const trailing = /[.,;:!?]+$/.exec(raw)?.[0] ?? "";
  const url = trailing ? raw.slice(0, -trailing.length) : raw;
  try {
    const parsed = new URL(/^www\./i.test(url) ? `https://${url}` : url);
    if (hosts.has(parsed.host.toLowerCase())) return `${parsed.pathname}${trailing}`;
  } catch {
    // Not a parseable URL: treated as foreign.
  }
  return `${REDACTED_LINK}${trailing}`;
}

function redactPhone(candidate: string): string {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return candidate;
  if (ISO_DATE_RE.test(candidate.trim())) return candidate;
  return REDACTED_PHONE;
}

/** Removes emails, phones, known names and URLs other than the app's own paths. */
export function redactForGithub(text: string, context: RedactionContext): RedactionResult {
  const hosts = new Set((context.appHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));

  let out = text;
  out = out.replace(URL_RE, (url) => redactUrl(url, hosts));
  out = out.replace(UUID_RE, REDACTED_ID);
  out = out.replace(EMAIL_RE, REDACTED_EMAIL);
  out = out.replace(PHONE_CANDIDATE_RE, redactPhone);

  // Clients and projects first: they are the longest, and a project may contain a person's name.
  out = replaceNames(out, uniqueByLength(context.clientNames), REDACTED_CLIENT);
  out = replaceNames(out, uniqueByLength(context.projectNames), REDACTED_PROJECT);
  out = replaceNames(out, personTerms([...context.staffNames, ...context.contactNames]), REDACTED_PERSON);

  return { text: out, changed: out !== text };
}
