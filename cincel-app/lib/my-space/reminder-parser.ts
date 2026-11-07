/**
 * Reminder text parser (redesign BE §8.4): es-MX, accent-insensitive, first
 * match wins, matched fragment (and a leading "recuérdame" / "recordarme" /
 * "recordar") removed from `cleanText`. Pure.
 *
 * Matching runs on a lowercase, accent-free copy of the text that keeps every
 * character at its original index, so the fragments are cut from the
 * original text (its accents and capitals stay in `cleanText`). The repeat
 * words are read first (they combine with a date); then the date rules run in
 * the order of the BE §8.4 table and the first one that matches decides
 * `dueAt`. A day rule also takes the time written right after it.
 */
import type { ParsedReminder, ReminderRepeat } from "@/lib/types/redesign";

import {
  ORG_TIME_ZONE,
  addDays,
  addMonths,
  isValidDate,
  localParts,
  weekdayOf,
  zonedTimeToUtc,
  type LocalDate,
} from "./zoned-time";

const DEFAULT_HOUR = 9;
const TARDE_HOUR = 16;
const NOCHE_HOUR = 20;

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Longest day each month can have (29 for febrero, any year). */
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const WD = "(lunes|martes|miercoles|jueves|viernes|sabado|domingo)";
const MON = `(${Object.keys(MONTHS).join("|")})`;
/** Word boundaries on the normalized (ASCII letters) text. */
const B = "(?<![a-z0-9])";
const E = "(?![a-z0-9])";
const MERIDIEM = "(?:am|pm|a\\.\\s?m\\.|p\\.\\s?m\\.)";
/** "cada 2 horas" / "el 3 días" are not a day of the month. */
const NOT_UNIT = "(?!\\s+(?:minutos?|mins?|horas?|hrs?|h|dias?|semanas?|meses)(?![a-z0-9]))";

/** A time expression, no capture groups (§8.4 "Time only" forms). */
const TIME =
  "(?:" +
  [
    `a\\s+las?\\s+\\d{1,2}(?::\\d{2})?(?:\\s*${MERIDIEM}|\\s*(?:hrs?|horas)|\\s+de\\s+la\\s+(?:manana|tarde|noche))?`,
    `\\d{1,2}(?::\\d{2})?\\s*${MERIDIEM}`,
    `\\d{1,2}\\s+de\\s+la\\s+(?:manana|tarde|noche)`,
    `\\d{1,2}:\\d{2}(?:\\s*(?:hrs?|horas))?`,
  ].join("|") +
  ")";

const TIME_PARTS =
  /^(a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:(am|a\.\s?m\.)|(pm|p\.\s?m\.)|hrs?|horas|de\s+la\s+(manana|tarde|noche))?$/;

type Time = { hour: number; minute: number };

/**
 * Hour and minute of a normalized time fragment; null when out of range.
 * `pm` reads a bare hour below 12 as afternoon ("esta tarde a las 5").
 */
export function parseTimeFragment(fragment: string, pm = false): Time | null {
  const m = TIME_PARTS.exec(fragment.trim());
  if (!m) return null;
  const [, , hourText, minuteText, am, pmMark, partOfDay] = m;
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (minute > 59) return null;
  if (am || partOfDay === "manana") {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
  } else if (pmMark || partOfDay === "tarde") {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + 12;
  } else if (partOfDay === "noche") {
    if (hour < 1 || hour > 12) return null;
    hour = hour === 12 ? 0 : hour + 12;
  } else {
    if (hour > 23) return null;
    if (pm && hour >= 1 && hour < 12) hour += 12;
    // "a las 1–7" without am/pm is afternoon (a zero-padded "07:00" is not).
    else if (hour >= 1 && hour <= 7 && hourText!.length === 1) hour += 12;
  }
  return { hour, minute };
}

/** Lowercase, accent-free copy with the same length and indexes as `text`. */
function normalize(text: string): string {
  let out = "";
  for (const ch of text) {
    const n = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += n.length === ch.length ? n : ch.length === 1 ? (n[0] ?? " ") : ch;
  }
  return out;
}

type Ctx = {
  original: string;
  /** Normalized text; cut fragments are blanked to spaces. */
  s: string;
  now: Date;
  tz: string;
  today: LocalDate;
};

function cut(ctx: Ctx, index: number, length: number): void {
  ctx.s = ctx.s.slice(0, index) + " ".repeat(length) + ctx.s.slice(index + length);
}

function at(ctx: Ctx, date: LocalDate, time: Time | null, fallback: Time = { hour: DEFAULT_HOUR, minute: 0 }): Date {
  const t = time ?? fallback;
  return zonedTimeToUtc(date, t.hour, t.minute, ctx.tz);
}

/** A rule either does not match, or matches a fragment naming an instant (null: no real date). */
type RuleResult = { kind: "none" } | { kind: "match"; index: number; length: number; dueAt: Date | null };
const NONE: RuleResult = { kind: "none" };
type Rule = (ctx: Ctx) => RuleResult;

function matched(m: RegExpExecArray, dueAt: Date | null): RuleResult {
  return { kind: "match", index: m.index, length: m[0].length, dueAt };
}

/** The time written after a day word: null when absent, "invalid" when out of range. */
function trailingTime(fragment: string | undefined, pm = false): Time | null | "invalid" {
  if (!fragment) return null;
  return parseTimeFragment(fragment, pm) ?? "invalid";
}

// ── Rules, in the order of the BE §8.4 table ──────────────────────────────────

const RELATIVE = new RegExp(`${B}en\\s+(\\d{1,4}|un|una|media)\\s+(minutos?|mins?|horas?|hrs?|h)${E}`);

const relativeRule: Rule = (ctx) => {
  const m = RELATIVE.exec(ctx.s);
  if (!m) return NONE;
  const amount = m[1] === "media" ? 0.5 : m[1] === "un" || m[1] === "una" ? 1 : Number(m[1]);
  const unitMs = m[2]!.startsWith("m") ? 60_000 : 3_600_000;
  return matched(m, new Date(ctx.now.getTime() + amount * unitMs));
};

const TODAY = new RegExp(`${B}(?:hoy\\s+(${TIME})|(${TIME})\\s+hoy|esta\\s+(tarde|noche)(?:\\s+(${TIME}))?)${E}`);

const todayRule: Rule = (ctx) => {
  const m = TODAY.exec(ctx.s);
  if (!m) return NONE;
  const [, afterHoy, beforeHoy, partOfDay, afterPart] = m;
  const time = partOfDay ? trailingTime(afterPart, true) : trailingTime(afterHoy ?? beforeHoy);
  if (time === "invalid") return matched(m, null);
  const fallback = { hour: partOfDay === "noche" ? NOCHE_HOUR : TARDE_HOUR, minute: 0 };
  return matched(m, at(ctx, ctx.today, time, fallback));
};

const TOMORROW = new RegExp(
  `${B}(pasado\\s+manana|(?<!${B}(?:de|por|en|esta)\\s+(?:la\\s+)?)manana)(?:\\s+(${TIME}))?${E}`,
);

const tomorrowRule: Rule = (ctx) => {
  const m = TOMORROW.exec(ctx.s);
  if (!m) return NONE;
  const time = trailingTime(m[2]);
  if (time === "invalid") return matched(m, null);
  const days = m[1]!.startsWith("pasado") ? 2 : 1;
  return matched(m, at(ctx, addDays(ctx.today, days), time));
};

const WEEKDAY = new RegExp(`${B}(?:(?:el|cada)\\s+)?(?:proximo\\s+)?${WD}(?:\\s+(${TIME}))?${E}`);

const weekdayRule: Rule = (ctx) => {
  const m = WEEKDAY.exec(ctx.s);
  if (!m) return NONE;
  const time = trailingTime(m[2]);
  if (time === "invalid") return matched(m, null);
  const target = WEEKDAYS[m[1]!]!;
  // Next occurrence, today excluded.
  const delta = (target - weekdayOf(ctx.today) + 7) % 7 || 7;
  return matched(m, at(ctx, addDays(ctx.today, delta), time));
};

const DATE = new RegExp(
  `${B}(?:` +
    `(?:el\\s+)?(\\d{1,2})\\s+de\\s+${MON}(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?` +
    `|(?:el\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?` +
    `|(?:el|cada)\\s+(\\d{1,2})${NOT_UNIT}(?:\\s*[°º])?(?:\\s+de\\s+(?:cada\\s+)?mes)?` +
    `)(?:\\s+(${TIME}))?${E}`,
);

/** First instant on `day`/`month` at `time` not before now, this year or later; null when the day never exists. */
function nextYearly(ctx: Ctx, day: number, month: number, time: Time | null): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > MAX_DAYS[month - 1]!) return null;
  for (let year = ctx.today.year; year <= ctx.today.year + 8; year++) {
    if (!isValidDate(year, month, day)) continue;
    const candidate = at(ctx, { year, month, day }, time);
    if (candidate.getTime() >= ctx.now.getTime()) return candidate;
  }
  return null;
}

/** First instant on day-of-month `day` at `time` not before now, this month or later. */
function nextMonthly(ctx: Ctx, day: number, time: Time | null): Date | null {
  if (day < 1 || day > 31) return null;
  for (let n = 0; n <= 12; n++) {
    const { year, month } = addMonths(ctx.today.year, ctx.today.month, n);
    if (!isValidDate(year, month, day)) continue;
    const candidate = at(ctx, { year, month, day }, time);
    if (candidate.getTime() >= ctx.now.getTime()) return candidate;
  }
  return null;
}

const dateRule: Rule = (ctx) => {
  const m = DATE.exec(ctx.s);
  if (!m) return NONE;
  const [, namedDay, monthName, namedYear, slashDay, slashMonth, slashYear, onlyDay, timeText] = m;
  const time = trailingTime(timeText);
  if (time === "invalid") return matched(m, null);

  if (onlyDay) return matched(m, nextMonthly(ctx, Number(onlyDay), time));

  const day = Number(namedDay ?? slashDay);
  const month = monthName ? MONTHS[monthName]! : Number(slashMonth);
  const yearText = namedYear ?? slashYear;
  if (yearText) {
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    return matched(m, isValidDate(year, month, day) ? at(ctx, { year, month, day }, time) : null);
  }
  // That date, next year if it already passed.
  return matched(m, nextYearly(ctx, day, month, time));
};

const TIME_ONLY = new RegExp(`${B}(${TIME})${E}`);

const timeOnlyRule: Rule = (ctx) => {
  const m = TIME_ONLY.exec(ctx.s);
  if (!m) return NONE;
  const time = parseTimeFragment(m[1]!);
  if (!time) return matched(m, null);
  const today = at(ctx, ctx.today, time);
  // Today if still ahead, else tomorrow.
  return matched(m, today.getTime() > ctx.now.getTime() ? today : at(ctx, addDays(ctx.today, 1), time));
};

const RULES: Rule[] = [relativeRule, todayRule, tomorrowRule, weekdayRule, dateRule, timeOnlyRule];

// ── Repeat words ──────────────────────────────────────────────────────────────

type Repeating = Exclude<ReminderRepeat, "none">;

/** Repeat words cut from the text. */
const REPEAT_CUT: { re: RegExp; repeat: Repeating }[] = [
  { re: new RegExp(`${B}(?:cada\\s+dia|diario|todos\\s+los\\s+dias)${E}`), repeat: "daily" },
  { re: new RegExp(`${B}cada\\s+semana${E}`), repeat: "weekly" },
  { re: new RegExp(`${B}(?:de\\s+)?cada\\s+mes${E}`), repeat: "monthly" },
];
/** `cada <día de la semana>` / `cada <n>°`: the weekday and date rules cut them along with their date. */
const REPEAT_KEEP: { re: RegExp; repeat: Repeating }[] = [
  { re: new RegExp(`${B}cada\\s+${WD}${E}`), repeat: "weekly" },
  { re: new RegExp(`${B}cada\\s+\\d{1,2}${NOT_UNIT}(?:\\s*[°º])?(?![a-z0-9:/])`), repeat: "monthly" },
];

function readRepeat(ctx: Ctx): ReminderRepeat {
  let found: { index: number; repeat: Repeating; cutLength: number } | null = null;
  for (const { re, repeat } of REPEAT_CUT) {
    const m = re.exec(ctx.s);
    if (m && (!found || m.index < found.index)) found = { index: m.index, repeat, cutLength: m[0].length };
  }
  for (const { re, repeat } of REPEAT_KEEP) {
    const m = re.exec(ctx.s);
    if (m && (!found || m.index < found.index)) found = { index: m.index, repeat, cutLength: 0 };
  }
  if (!found) return "none";
  if (found.cutLength) cut(ctx, found.index, found.cutLength);
  return found.repeat;
}

const LEADING_VERB = /^\s*(?:recuerdame|recordarme|recordar)(?![a-z0-9])/;

function cleanTextOf(ctx: Ctx): string {
  let out = "";
  for (let i = 0; i < ctx.original.length; i++) {
    out += ctx.s[i] === " " ? " " : ctx.original[i];
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.\-–—]+/, "")
    .replace(/[\s,;:\-–—]+$/, "")
    .trim();
}

export function parseReminderText(text: string, now: Date, tz: string = ORG_TIME_ZONE): ParsedReminder {
  const original = text.normalize("NFC");
  const local = localParts(now, tz);
  const ctx: Ctx = {
    original,
    s: normalize(original),
    now,
    tz,
    today: { year: local.year, month: local.month, day: local.day },
  };

  const verb = LEADING_VERB.exec(ctx.s);
  if (verb) cut(ctx, 0, verb[0].length);

  const repeat = readRepeat(ctx);

  let dueAt: Date | null = null;
  for (const rule of RULES) {
    const result = rule(ctx);
    if (result.kind === "none") continue;
    // First match wins; a fragment that names no real date ("31 de febrero") stays in the text.
    if (result.dueAt) {
      cut(ctx, result.index, result.length);
      dueAt = result.dueAt;
    }
    break;
  }

  return { cleanText: cleanTextOf(ctx), dueAt: dueAt ? dueAt.toISOString() : null, repeat };
}
