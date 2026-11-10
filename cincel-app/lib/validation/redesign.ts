/**
 * Zod schemas for the redesign (BE §6, §7): stored settings (`app_settings`
 * JSON), the appearance cookie and every action input. Strict parse style of
 * `lib/settings/general-settings-schema.ts`; actions parse with `parseInput`,
 * which throws `INVALID: <path>`.
 */
import { z } from "zod";

import { presetFilledTokens, SHAPE_BOUNDS, TYPE_SCALE_BOUNDS } from "@/lib/ui/themes";
import type {
  AppearanceCookie,
  OrgAppearance,
  StoredOrgAppearance,
  TimeTrackingSettings,
  TokenName,
  TypeRole,
  UserPreferences,
  VacationSettings,
} from "@/lib/types/redesign";

export { parseInput } from "@/lib/validation/project-flow";

// ── Primitives ──────────────────────────────────────────────────────────────
const uuid = z.uuid();
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });
/** "HH:MM", 00:00–23:59. */
export const HourMinuteSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** "YYYY-MM". */
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const ThemeIdSchema = z.enum(["azul", "calido", "grafito"]);
export const ColorModeSchema = z.enum(["light", "dark", "system"]);
export const PresentationStyleSchema = z.enum(["visual", "esencial", "analitico"]);
export const DensitySchema = z.enum(["comoda", "compacta"]);
export const TextSizeSchema = z.union([
  z.literal(13),
  z.literal(13.5),
  z.literal(14),
  z.literal(14.5),
  z.literal(15),
  z.literal(15.5),
  z.literal(16),
]);
export const NotificationKindSchema = z.enum([
  "asignacion",
  "mencion",
  "vencimiento",
  "comentario",
  "aprobacion_cliente",
  "recordatorio",
  "sistema",
]);
export const NoteColorSchema = z.enum(["neutral", "blue", "amber", "violet", "cyan"]);
export const ReminderRepeatSchema = z.enum(["none", "daily", "weekly", "monthly"]);
export const ReminderChannelSchema = z.enum(["app", "email"]);
export const VacationKindSchema = z.enum(["vacaciones", "personal", "enfermedad"]);
export const SearchResultTypeSchema = z.enum(["proyecto", "tarea", "persona", "archivo", "nota"]);

const QuietHoursSchema = z.object({ from: HourMinuteSchema, to: HourMinuteSchema }).strict();

// ── Appearance ──────────────────────────────────────────────────────────────

/** Accepted token colors (BE §5.4): `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgba(r,g,b,a)`. */
const TOKEN_COLOR =
  /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\))$/;

export function isTokenColor(value: string): boolean {
  return TOKEN_COLOR.test(value.trim());
}

export const TokenColorSchema = z.string().refine(isTokenColor);

const TOKEN_NAME_LIST = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "warning", "warning-ink", "success",
  "border", "border-strong", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "chart-1-ink", "chart-2-ink", "chart-3-ink", "chart-4-ink", "chart-5-ink",
  "tint-primary", "tint-violet", "tint-warning", "tint-cyan", "tint-destructive", "tint-success",
  "destructive-ink", "foreground-soft",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
] as const satisfies readonly TokenName[];

const tokenPair = z.object({ light: TokenColorSchema, dark: TokenColorSchema }).strict();

/**
 * Tokens added after org appearances were first saved (tints, `destructive-ink`,
 * `foreground-soft`): optional on input and filled from the org's preset, so a
 * saved appearance without them still parses and needs no data migration.
 */
const LATER_TOKEN_NAMES = [
  "tint-primary", "tint-violet", "tint-warning", "tint-cyan", "tint-destructive", "tint-success",
  "destructive-ink", "foreground-soft",
] as const satisfies readonly TokenName[];
type LaterTokenName = (typeof LATER_TOKEN_NAMES)[number];

const isLaterToken = (name: TokenName): name is LaterTokenName => (LATER_TOKEN_NAMES as readonly TokenName[]).includes(name);

const TokensSchema = z
  .object(
    Object.fromEntries(TOKEN_NAME_LIST.map((name) => [name, isLaterToken(name) ? tokenPair.optional() : tokenPair])) as Record<
      Exclude<TokenName, LaterTokenName>,
      typeof tokenPair
    > &
      Record<LaterTokenName, z.ZodOptional<typeof tokenPair>>,
  )
  .strict();

/** Fills the tokens a saved appearance predates from its base preset. */
function withPresetTokens<T extends { baseTheme: OrgAppearance["baseTheme"]; tokens: Partial<OrgAppearance["tokens"]> }>(
  value: T,
): Omit<T, "tokens"> & { tokens: OrgAppearance["tokens"] } {
  return { ...value, tokens: presetFilledTokens(value.baseTheme, value.tokens) };
}

const weight = z.union([z.literal(400), z.literal(500), z.literal(600)]);

function typeRole(role: TypeRole) {
  const { min, max } = TYPE_SCALE_BOUNDS[role];
  return z.object({ size: z.number().min(min).max(max), weight }).strict();
}

const TypeScaleSchema = z
  .object({
    pageTitle: typeRole("pageTitle"),
    sectionTitle: typeRole("sectionTitle"),
    cardTitle: typeRole("cardTitle"),
    body: typeRole("body"),
    label: typeRole("label"),
    kpi: typeRole("kpi"),
  })
  .strict();

const ShapeSchema = z
  .object({
    radius: z.number().min(SHAPE_BOUNDS.radius.min).max(SHAPE_BOUNDS.radius.max),
    cardPadding: z.number().min(SHAPE_BOUNDS.cardPadding.min).max(SHAPE_BOUNDS.cardPadding.max),
    gap: z.number().min(SHAPE_BOUNDS.gap.min).max(SHAPE_BOUNDS.gap.max),
    shadow: z.enum(["none", "suave", "marcada"]),
  })
  .strict();

/** `saveOrgAppearanceAction` input (BE §7.1). Contrast is checked separately (`lib/ui/contrast.ts`). */
const OrgAppearanceObjectSchema = z
  .object({
    baseTheme: ThemeIdSchema,
    tokens: TokensSchema,
    typeScale: TypeScaleSchema,
    fontFamily: z.enum(["Geist", "Inter", "DM Sans"]),
    shape: ShapeSchema,
    styleDefault: PresentationStyleSchema,
    allowUserOverride: z.boolean(),
  })
  .strict();

export const OrgAppearanceSchema = OrgAppearanceObjectSchema.transform(withPresetTokens) satisfies z.ZodType<OrgAppearance>;

/**
 * Keys an `appearance.theme` value saved before the cleanup phase may still
 * carry (the retired rollout switches). Readers drop them before validating,
 * so a theme stored earlier keeps applying.
 */
const RETIRED_ORG_APPEARANCE_KEYS = ["redesignDefault", "redesignAvailable"] as const;

/** A copy of the stored `data` without the retired keys; anything that is not a plain object is returned as is. */
export function withoutRetiredOrgAppearanceKeys(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const copy: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of RETIRED_ORG_APPEARANCE_KEYS) delete copy[key];
  return copy;
}

/** `app_settings('appearance.theme').data`: the org appearance plus its version `v` (BE §3.12). */
export const StoredOrgAppearanceSchema = OrgAppearanceObjectSchema.extend({
  v: z.number().int().min(1),
})
  .strict()
  .transform(withPresetTokens) satisfies z.ZodType<StoredOrgAppearance>;

/** `updateMyPreferencesAction(patch)` (BE §7.1). */
export const UserPreferencesPatchSchema = z
  .object({
    theme: ThemeIdSchema.nullable(),
    mode: ColorModeSchema,
    style: PresentationStyleSchema.nullable(),
    density: DensitySchema,
    textSize: TextSizeSchema,
    quietHours: QuietHoursSchema.nullable(),
  })
  .strict()
  .partial() satisfies z.ZodType<Partial<UserPreferences>>;

/** JSON of the `cincel-appearance` cookie (BE §8.2). */
export const AppearanceCookieSchema = z
  .object({
    theme: ThemeIdSchema,
    mode: ColorModeSchema,
    style: PresentationStyleSchema,
    density: DensitySchema,
    textSize: TextSizeSchema,
    v: z.number().int().min(1),
  })
  .strict() satisfies z.ZodType<AppearanceCookie>;

// ── Org settings stored in app_settings ─────────────────────────────────────

/** `app_settings('time_tracking').data` and `saveTimeTrackingSettingsAction` (BE §7.7). */
export const TimeTrackingSettingsSchema = z
  .object({
    enabled: z.boolean(),
    requiredFrom: isoDate.nullable(),
    dayStart: HourMinuteSchema,
    dayEnd: HourMinuteSchema,
    hoursPerDay: z.number().min(1).max(12),
    lateToleranceMin: z.number().int().min(0).max(240),
    workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    promptAtLogin: z.boolean(),
    autoCloseAt: HourMinuteSchema.nullable(),
    lunchMinutes: z.number().int().min(0).max(240),
    exemptRoles: z.array(z.string().min(1)).max(50),
  })
  .strict()
  .refine((s) => s.dayEnd > s.dayStart, { path: ["dayEnd"] }) satisfies z.ZodType<TimeTrackingSettings>;

/** `app_settings('vacations').data` (BE §3.12). */
export const VacationSettingsSchema = z
  .object({ daysPerYear: z.number().int().min(0).max(60) })
  .strict() satisfies z.ZodType<VacationSettings>;

/** Wrapper of every redesign `app_settings` JSON value: `{ version: 1, data }`. */
export function versionedSetting<S extends z.ZodType>(data: S) {
  return z.object({ version: z.literal(1), data }).strict();
}

// ── Action inputs ───────────────────────────────────────────────────────────

/** `searchWorkspaceAction` (BE §7.3). */
export const SearchInputSchema = z
  .object({
    query: z.string().trim().min(2).max(200),
    types: z.array(SearchResultTypeSchema).max(5).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

/** `fetchNotificationsAction` (BE §7.4); cursor `<createdAt ISO>_<id>`. */
export const NotificationsQuerySchema = z
  .object({
    unreadOnly: z.boolean().optional(),
    kinds: z.array(NotificationKindSchema).optional(),
    cursor: z.string().max(200).optional(),
  })
  .strict();

/** `markNotificationsReadAction(ids)`. */
export const MarkNotificationsReadSchema = z.union([z.literal("all"), z.array(uuid).max(500)]);

/** `updateNotificationPreferencesAction` (BE §7.4). */
export const NotificationPreferencesSchema = z
  .object({
    rows: z
      .array(
        z
          .object({ kind: NotificationKindSchema, inApp: z.boolean(), email: z.boolean(), digest: z.boolean() })
          .strict(),
      )
      .max(7),
    quietHours: QuietHoursSchema.nullable(),
  })
  .strict();

export const NOTE_BODY_MAX = 20_000;

/** `createNoteAction` (BE §7.5); title or body must be non-empty. */
export const NoteInputSchema = z
  .object({
    title: z.string().max(300).optional(),
    body: z.string().max(NOTE_BODY_MAX).optional(),
    color: NoteColorSchema.optional(),
    pinned: z.boolean().optional(),
    projectId: uuid.nullable().optional(),
  })
  .strict()
  .refine((n) => (n.title ?? "").trim().length > 0 || (n.body ?? "").trim().length > 0, { path: ["body"] });

/** `updateNoteAction(id, patch)`. */
export const NotePatchSchema = z
  .object({
    title: z.string().max(300),
    body: z.string().max(NOTE_BODY_MAX),
    color: NoteColorSchema,
    pinned: z.boolean(),
    projectId: uuid.nullable(),
  })
  .strict()
  .partial();

const checklistText = z.string().trim().min(1).max(500);

/** `createChecklistAction` (BE §7.5). */
export const ChecklistInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    items: z.array(checklistText).max(200).optional(),
    projectId: uuid.optional(),
  })
  .strict();

export const ChecklistItemTextSchema = checklistText;
export const OrderedIdsSchema = z.array(uuid).max(500);

/** `fetchRemindersAction` (BE §7.5). */
export const RemindersRangeSchema = z.object({ from: isoDateTime.optional(), to: isoDateTime.optional() }).strict();

/** `parseReminderTextAction(text)` (≤ 280). */
export const ReminderTextSchema = z.string().trim().min(1).max(280);

/** `createReminderAction` (BE §7.5). */
export const ReminderInputSchema = z
  .object({
    text: ReminderTextSchema,
    dueAt: isoDateTime,
    repeat: ReminderRepeatSchema.optional(),
    channels: z.array(ReminderChannelSchema).min(1).max(2).optional(),
    taskId: uuid.optional(),
    projectId: uuid.optional(),
  })
  .strict();

export const IsoDateTimeSchema = isoDateTime;

/** `fetchGmailThreadsAction` (BE §7.6). */
export const GmailThreadsQuerySchema = z
  .object({ query: z.string().max(200).optional(), cursor: z.string().max(200).optional() })
  .strict();

/** `createGmailDraftAction` (BE §7.6). */
export const GmailDraftInputSchema = z
  .object({
    to: z.array(z.email()).min(1).max(20),
    subject: z.string().max(500),
    body: z.string().max(100_000),
    replyToThreadId: z.string().min(1).max(200).optional(),
    draftId: z.string().min(1).max(200).optional(),
  })
  .strict();

/** `createTaskFromGmailThreadAction(threadId, input)`. */
export const GmailTaskInputSchema = z
  .object({ projectId: uuid, title: z.string().trim().min(1).max(300).optional() })
  .strict();

/** `clockInAction` (BE §7.7). */
export const ClockInInputSchema = z.object({ source: z.enum(["sidebar", "login", "assistant"]) }).strict();

/** `fetchTeamHoursAction`: `weekStart` must be a Monday. */
export const TeamHoursInputSchema = z
  .object({ weekStart: isoDate })
  .strict()
  .refine((v) => new Date(`${v.weekStart}T12:00:00Z`).getUTCDay() === 1, { path: ["weekStart"] });

/** `fetchMyWeekHoursAction`: an optional Monday (that it is not a future week is checked against today). */
export const MyWeekHoursInputSchema = z
  .object({ weekStart: isoDate.optional() })
  .strict()
  .refine((v) => v.weekStart === undefined || new Date(`${v.weekStart}T12:00:00Z`).getUTCDay() === 1, {
    path: ["weekStart"],
  });

/** `requestVacationAction` (BE §7.8). */
export const VacationRequestInputSchema = z
  .object({ from: isoDate, to: isoDate, kind: VacationKindSchema, comment: z.string().max(1000).optional() })
  .strict()
  .refine((v) => v.to >= v.from, { path: ["to"] });

export const VacationDecisionSchema = z.enum(["aprobada", "rechazada"]);

/** `fetchTeamAbsencesAction`. */
export const TeamAbsencesInputSchema = z.object({ month: MonthSchema }).strict();

/** `saveVacationSettingsAction` (BE §7.8). */
export const VacationSettingsInputSchema = z
  .object({
    daysPerYear: z.number().int().min(0).max(60),
    overrides: z
      .array(z.object({ staffId: uuid, days: z.number().int().min(0).max(60).nullable() }).strict())
      .max(1000),
  })
  .strict();

/** `AssistantContext` from the client (ids are re-checked server-side, BE §8.10). */
export const AssistantContextSchema = z
  .object({
    route: z.string().max(500),
    projectId: uuid.optional(),
    taskId: uuid.optional(),
    personId: uuid.optional(),
  })
  .strict();

/** `fetchAssistantActionsAction` (BE §7.9). */
export const AssistantActionsQuerySchema = z
  .object({ threadId: uuid.optional(), cursor: z.string().max(200).optional() })
  .strict();

/** `importLegacyAssistantThreadAction(messages)`: ≤ 200 UIMessages. */
export const LegacyAssistantMessagesSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(200),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()),
      })
      .loose(),
  )
  .min(1)
  .max(200);

export const UuidSchema = uuid;
