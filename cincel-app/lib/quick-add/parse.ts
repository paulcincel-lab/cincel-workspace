/**
 * Smart quick-add parser (pure, client-safe): `@persona`, `#etapa`, dates,
 * `!prioridad`, `~2h` / `~30m` (horas estimadas) and `/` commands, written on the last line of a list, column
 * or card (`QuickAddRow`).
 *
 * Matching runs on a normalized form (NFD, no diacritics, es-MX lower case);
 * the title keeps the original spelling of every token that was not
 * consumed. Dates are calendar-day arithmetic on `ctx.today` (already in the
 * org time zone), never on the browser's local time.
 */
import type { TaskPriority } from "@/lib/types/core";

export type QuickAddPerson = { id: string; name: string; suggested?: boolean; openCount?: number; overdueCount?: number };
export type QuickAddEtapa = { id: string; key: string; name: string };
export type QuickAddParseContext = {
  /** YYYY-MM-DD, org time zone */
  today: string;
  people: readonly QuickAddPerson[];
  etapas: readonly QuickAddEtapa[];
  meId: string | null;
};
export type QuickAddToken = {
  kind: "person" | "etapa" | "date" | "priority" | "hours";
  start: number;
  end: number;
  raw: string;
  status: "resolved" | "ambiguous" | "unknown";
  value?: string;
  label?: string;
  candidates?: { id: string; label: string }[];
};
export type ParsedQuickAdd = {
  title: string;
  assigneeId?: string;
  etapaId?: string;
  dueDate?: string;
  priority?: TaskPriority;
  /** Planned hours from a `~2h` / `~30m` token (0 < x <= 80). */
  estimatedHours?: number;
  tokens: QuickAddToken[];
  slash: string | null;
};

// ── Normalization ────────────────────────────────────────────────────────────

/** NFD, no diacritics, es-MX lower case: "Diseño" → "diseno". */
export function normalizeQuickAdd(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-MX");
}

/** The normalized word without trailing punctuation ("viernes," → "viernes"). */
function wordOf(raw: string): string {
  return normalizeQuickAdd(raw).replace(/[.,;:?)]+$/u, "");
}

type RawToken = { raw: string; start: number; end: number; norm: string };

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    out.push({ raw: m[0], start, end: start + m[0].length, norm: wordOf(m[0]) });
  }
  return out;
}

// ── Calendar days (UTC math on ISO strings) ─────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function isoOf(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** `iso` + `days` calendar days. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseIso(iso);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return isoOf(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The next `weekday` strictly after `today`. */
export function nextWeekday(today: string, weekday: number): string {
  const delta = (weekday - weekdayOf(today) + 7) % 7 || 7;
  return addDays(today, delta);
}

/** A real calendar day, or null (`31/02`, `32/1`, `29/02` outside a leap year). */
function validIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null;
  return isoOf(y, m, d);
}

/** Day and month without a year: this year unless it is before today, then next year. */
function rollover(today: string, m: number, d: number): string | null {
  const { y } = parseIso(today);
  const thisYear = validIso(y, m, d);
  if (thisYear && thisYear >= today) return thisYear;
  return validIso(y + 1, m, d);
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** 1–12 for a month name or a prefix of it of 3+ letters ("nov", "noviem", "noviembre"). */
function monthOf(word: string): number | null {
  if (word.length < 3) return null;
  const index = MONTHS.findIndex((name) => name.startsWith(word));
  return index < 0 ? null : index + 1;
}

const DAY = /^\d{1,2}$/;

type DateMatch = { length: number; iso: string | null };

/** The date expression that starts at token `i` (its token count and day, null when impossible), or null. */
function matchDate(tokens: readonly RawToken[], i: number, today: string): DateMatch | null {
  const w = (k: number) => tokens[i + k]?.norm ?? "";
  const w0 = w(0);

  if (w0 === "pasado" && w(1) === "manana") return { length: 2, iso: addDays(today, 2) };
  if (w0 === "la" && w(1) === "proxima" && w(2) === "semana") return { length: 3, iso: nextWeekday(today, 1) };
  if (w0 === "proxima" && w(1) === "semana") return { length: 2, iso: nextWeekday(today, 1) };
  if (w0 === "en" && /^\d+$/.test(w(1))) {
    const unit = w(2);
    const days = unit === "dia" || unit === "dias" ? 1 : unit === "semana" || unit === "semanas" ? 7 : 0;
    if (days) {
      const n = Number(w(1));
      return { length: 3, iso: n >= 1 && n <= 365 ? addDays(today, n * days) : null };
    }
  }
  if (DAY.test(w0)) {
    if (w(1) === "de") {
      const month = monthOf(w(2));
      if (month) return { length: 3, iso: rollover(today, month, Number(w0)) };
    }
    const month = monthOf(w(1));
    if (month) return { length: 2, iso: rollover(today, month, Number(w0)) };
  }

  if (w0 === "hoy") return { length: 1, iso: today };
  if (w0 === "manana") return { length: 1, iso: addDays(today, 1) };
  if (Object.hasOwn(WEEKDAYS, w0)) return { length: 1, iso: nextWeekday(today, WEEKDAYS[w0]) };
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(w0);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    return { length: 1, iso: slash[3] ? validIso(Number(slash[3]), m, d) : rollover(today, m, d) };
  }
  return null;
}

// ── People, etapas, priority ────────────────────────────────────────────────

const byName = (a: QuickAddPerson, b: QuickAddPerson) => a.name.localeCompare(b.name, "es-MX");

const nameWords = (p: QuickAddPerson) => normalizeQuickAdd(p.name).split(/\s+/).filter(Boolean);

/**
 * People matching an `@` query (normalized, without the `@`): a word of the
 * name equals it, else a word starts with it (2+ chars), else the compact
 * full name ("anaruiz") starts with it. Suggested first, then by name; empty
 * for a query shorter than 2.
 */
export function matchPeople(query: string, people: readonly QuickAddPerson[]): QuickAddPerson[] {
  if (query.length < 2) return [];
  let found = people.filter((p) => nameWords(p).includes(query));
  if (found.length === 0) found = people.filter((p) => nameWords(p).some((x) => x.startsWith(query)));
  if (found.length === 0) found = people.filter((p) => nameWords(p).join("").startsWith(query));
  return [...found].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)) || byName(a, b));
}

/** The shortest `@` handle that resolves to `person` alone: the first name, else the compact full name. */
export function personHandle(person: QuickAddPerson, people: readonly QuickAddPerson[]): string {
  const words = nameWords(person);
  const first = words[0] ?? "";
  const hits = matchPeople(first, people);
  if (hits.length === 1 && hits[0].id === person.id) return `@${first}`;
  return `@${words.join("")}`;
}

function matchEtapas(query: string, etapas: readonly QuickAddEtapa[]): QuickAddEtapa[] {
  if (!query) return [];
  const forms = (t: QuickAddEtapa) => [normalizeQuickAdd(t.key), normalizeQuickAdd(t.name)];
  const exact = etapas.filter((t) => forms(t).includes(query));
  if (exact.length > 0 || query.length < 2) return exact;
  return etapas.filter((t) => forms(t).some((f) => f.startsWith(query)));
}

const PRIORITIES: readonly { value: TaskPriority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

/** Planned hours of a `~2h`, `~1.5h` or `~30m` word (normalized); undefined when it is not one or is out of 0–80. */
function hoursOf(word: string): number | undefined {
  const m = /^~(\d+(?:[.,]\d+)?)(h|hr|hrs|m|min)$/.exec(word);
  if (!m) return undefined;
  const amount = Number(m[1].replace(",", "."));
  const hours = m[2].startsWith("h") ? amount : amount / 60;
  const rounded = Math.round(hours * 100) / 100;
  return rounded > 0 && rounded <= 80 ? rounded : undefined;
}

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parses one quick-add line. `/…` is a request for the Asistente and parses
 * nothing else. Resolved tokens are consumed (the last of each kind wins;
 * only the first date expression counts); ambiguous and unknown tokens stay
 * in the title.
 */
export function parseQuickAdd(text: string, ctx: QuickAddParseContext): ParsedQuickAdd {
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) return { title: "", tokens: [], slash: trimmed.slice(1).trim() };

  const raw = tokenize(text);
  const consumed = new Set<number>();
  const tokens: QuickAddToken[] = [];
  const out: ParsedQuickAdd = { title: "", tokens, slash: null };
  let dateTaken = false;

  const push = (index: number, token: Omit<QuickAddToken, "start" | "end" | "raw">, length = 1) => {
    const first = raw[index];
    const last = raw[index + length - 1];
    tokens.push({ ...token, start: first.start, end: last.end, raw: text.slice(first.start, last.end) });
    if (token.status === "resolved") for (let k = 0; k < length; k++) consumed.add(index + k);
  };

  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const sigil = t.raw[0];

    if (sigil === "@") {
      const query = t.norm.slice(1);
      if ((query === "yo" || query === "mi") && ctx.meId) {
        const me = ctx.people.find((p) => p.id === ctx.meId);
        push(i, { kind: "person", status: "resolved", value: ctx.meId, label: me?.name ?? "Yo" });
        out.assigneeId = ctx.meId;
        continue;
      }
      const found = matchPeople(query, ctx.people);
      if (found.length === 1) {
        push(i, { kind: "person", status: "resolved", value: found[0].id, label: found[0].name });
        out.assigneeId = found[0].id;
      } else if (found.length > 1) {
        push(i, { kind: "person", status: "ambiguous", candidates: found.map((p) => ({ id: p.id, label: p.name })) });
      } else {
        push(i, { kind: "person", status: "unknown" });
      }
      continue;
    }

    if (sigil === "#") {
      const found = matchEtapas(t.norm.slice(1), ctx.etapas);
      if (found.length === 1) {
        push(i, { kind: "etapa", status: "resolved", value: found[0].id, label: found[0].name });
        out.etapaId = found[0].id;
      } else if (found.length > 1) {
        push(i, { kind: "etapa", status: "ambiguous", candidates: found.map((w) => ({ id: w.id, label: w.name })) });
      } else {
        push(i, { kind: "etapa", status: "unknown" });
      }
      continue;
    }

    if (sigil === "!") {
      const query = t.norm.slice(1);
      const found = query ? PRIORITIES.find((p) => p.value.startsWith(query)) : undefined;
      if (found) {
        push(i, { kind: "priority", status: "resolved", value: found.value, label: found.label });
        out.priority = found.value;
      } else {
        push(i, { kind: "priority", status: "unknown" });
      }
      continue;
    }

    if (sigil === "~") {
      const hours = hoursOf(t.norm);
      if (hours !== undefined) {
        push(i, { kind: "hours", status: "resolved", value: String(hours), label: formatQuickAddHours(hours) });
        out.estimatedHours = hours;
      } else {
        push(i, { kind: "hours", status: "unknown" });
      }
      continue;
    }

    if (dateTaken) continue;
    const date = matchDate(raw, i, ctx.today);
    if (!date) continue;
    if (date.iso) {
      push(i, { kind: "date", status: "resolved", value: date.iso, label: formatQuickAddDate(date.iso) }, date.length);
      out.dueDate = date.iso;
      dateTaken = true;
    } else {
      push(i, { kind: "date", status: "unknown" }, date.length);
    }
    i += date.length - 1;
  }

  out.title = raw
    .filter((_, index) => !consumed.has(index))
    .map((t) => t.raw)
    .join(" ")
    .trim();
  return out;
}

// ── Display helpers ─────────────────────────────────────────────────────────

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "13 nov"; with `weekday`, "vie 13 nov". */
export function formatQuickAddDate(iso: string, options: { weekday?: boolean } = {}): string {
  const { m, d } = parseIso(iso);
  const base = `${d} ${MONTH_SHORT[m - 1]}`;
  return options.weekday ? `${WEEKDAY_SHORT[weekdayOf(iso)]} ${base}` : base;
}

/** "2 h", "1.5 h": the planned hours of a draft. */
export function formatQuickAddHours(hours: number): string {
  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(hours)} h`;
}
