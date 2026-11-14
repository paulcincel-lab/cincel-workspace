import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getAppSetting } from "@/lib/repositories/app-settings-repository";
import { findUserPreferences, type UserPreferencesRow } from "@/lib/repositories/preferences-repository";
import type {
  AppearanceCookie,
  OrgAppearance,
  ResolvedAppearance,
  StoredOrgAppearance,
  TextSize,
  UserPreferences,
} from "@/lib/types/redesign";
import { parseAppearanceCookie } from "@/lib/ui/appearance-cookie";
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_COOKIE_OPTIONS,
  DEFAULT_USER_PREFERENCES,
  resolveAppearance,
  serializeAppearanceCookie,
} from "@/lib/ui/preferences";
import { StoredOrgAppearanceSchema, withoutRetiredOrgAppearanceKeys } from "@/lib/validation/redesign";

/** `app_settings` key of the org appearance (BE §3.12). */
export const ORG_APPEARANCE_SETTING_KEY = "appearance.theme";

/** The Azul preset at version 1: what a missing or unreadable `appearance.theme` means. */
export const DEFAULT_STORED_ORG_APPEARANCE: StoredOrgAppearance = { ...DEFAULT_ORG_APPEARANCE, v: 1 };

/**
 * Parses the stored `{ version: 1, data }` JSON of `appearance.theme`; null
 * when missing or invalid (the caller falls back to the Azul preset).
 */
export function parseStoredOrgAppearance(raw: string | null): StoredOrgAppearance | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || (json as { version?: unknown }).version !== 1) return null;
  const parsed = StoredOrgAppearanceSchema.safeParse(withoutRetiredOrgAppearanceKeys((json as { data?: unknown }).data));
  return parsed.success ? parsed.data : null;
}

/**
 * The stored org appearance with its version `v` (per-request cache). On a
 * DB error logs and returns the Azul preset.
 */
export const getStoredOrgAppearance = cache(async (): Promise<StoredOrgAppearance> => {
  // Request-time data: opt out of prerendering before touching the DB, so
  // `next build` never queries Postgres.
  await connection();
  try {
    return parseStoredOrgAppearance(await getAppSetting(ORG_APPEARANCE_SETTING_KEY)) ?? DEFAULT_STORED_ORG_APPEARANCE;
  } catch (error) {
    // Let Next.js control-flow errors (dynamic rendering, redirect, notFound) through.
    unstable_rethrow(error);
    console.error("[appearance] could not read the org appearance", error);
    return DEFAULT_STORED_ORG_APPEARANCE;
  }
});

/** The org appearance without its version (what `fetchOrgAppearanceAction` returns). */
export function withoutVersion(stored: StoredOrgAppearance): OrgAppearance {
  const { v, ...appearance } = stored;
  void v;
  return appearance;
}

/** `"HH:MM:SS"` (Postgres `time`) → `"HH:MM"`. */
function hourMinute(value: string): string {
  return value.slice(0, 5);
}

/** A stored row as the resolver input; null for no row (= all defaults). */
export function rowToResolverInput(row: UserPreferencesRow | null): UserPreferences | null {
  if (!row) return null;
  return {
    theme: row.theme,
    mode: row.mode,
    style: row.style,
    density: row.density,
    textSize: Number(row.textSize) as TextSize,
    quietHours:
      row.quietFrom && row.quietTo ? { from: hourMinute(row.quietFrom), to: hourMinute(row.quietTo) } : null,
    // Left out at its default (`DEFAULT_HIDE_COMPLETED_TASKS`), like a missing key.
    ...(row.hideCompletedTasks ? { hideCompletedTasks: true } : {}),
    // Likewise left out while no table has custom widths.
    ...(Object.keys(row.tableColumnWidths ?? {}).length > 0 ? { tableColumnWidths: row.tableColumnWidths } : {}),
  };
}

/** A stored row as `UserPreferences`: defaults when there is no row (BE §3.3, §8.1). */
export function rowToUserPreferences(row: UserPreferencesRow | null): UserPreferences {
  return rowToResolverInput(row) ?? { ...DEFAULT_USER_PREFERENCES };
}

/** The `cincel-appearance` cookie of this request; null when missing, invalid or of another org version. */
export async function readAppearanceCookie(currentVersion: number): Promise<AppearanceCookie | null> {
  try {
    const jar = await cookies();
    return parseAppearanceCookie(jar.get(APPEARANCE_COOKIE)?.value, currentVersion);
  } catch {
    return null;
  }
}

/** Writes the `cincel-appearance` cookie (server actions and route handlers only). */
export async function writeAppearanceCookie(appearance: ResolvedAppearance): Promise<void> {
  const jar = await cookies();
  jar.set(APPEARANCE_COOKIE, serializeAppearanceCookie(appearance), {
    ...APPEARANCE_COOKIE_OPTIONS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** One staff member's resolved appearance from the DB (org setting + preferences row). */
export async function resolveAppearanceForStaff(staffId: string): Promise<ResolvedAppearance> {
  const org = await getStoredOrgAppearance();
  const row = await findUserPreferences(db, staffId);
  return resolveAppearance(org, rowToResolverInput(row));
}

/**
 * Sign-in hook (BE §8.2): writes the cookie from the DB row. Never fails the
 * sign-in; an error only logs.
 */
export async function writeAppearanceCookieForStaff(staffId: string): Promise<void> {
  try {
    await writeAppearanceCookie(await resolveAppearanceForStaff(staffId));
  } catch (error) {
    // Let Next.js control-flow errors (dynamic rendering, redirect, notFound) through.
    unstable_rethrow(error);
    console.error("[appearance] could not write the appearance cookie", error);
  }
}

/**
 * The session caller's preferences row (per-request cache): `{ row }` (row
 * null = no row yet), or null for a guest. `getResolvedAppearance` and
 * `getMyPreferences` share it, so the root layout reads it once.
 */
const getMyPreferencesRow = cache(async (): Promise<{ row: UserPreferencesRow | null } | null> => {
  const session = await getSession();
  if (!session) return null;
  return { row: await findUserPreferences(db, session.user.id) };
});

/**
 * The caller's raw preferences (null theme/style = the organization's), for
 * the `useAppearance` seed (Ajustes › Apariencia reads them from the store).
 * Null for a guest or on a DB error (the store then derives them from the
 * resolved appearance).
 */
export const getMyPreferences = cache(async (): Promise<UserPreferences | null> => {
  try {
    const mine = await getMyPreferencesRow();
    return mine ? rowToUserPreferences(mine.row) : null;
  } catch (error) {
    // Let Next.js control-flow errors (dynamic rendering, redirect, notFound) through.
    unstable_rethrow(error);
    console.error("[appearance] could not read the preferences", error);
    return null;
  }
});

/**
 * The caller's resolved appearance (redesign BE §8.1): reads
 * `appearance.theme` (per-request cache) and the caller's preferences row.
 * The DB is the source of truth; the cookie (`readAppearanceCookie`) is a
 * hint that is ignored when its `v` differs. Guests resolve with no row. On
 * DB errors logs and returns the Azul defaults.
 */
export const getResolvedAppearance = cache(async (): Promise<ResolvedAppearance> => {
  const org = await getStoredOrgAppearance();
  try {
    const mine = await getMyPreferencesRow();
    if (!mine) return resolveAppearance(org, null);
    return resolveAppearance(org, rowToResolverInput(mine.row));
  } catch (error) {
    // Let Next.js control-flow errors (dynamic rendering, redirect, notFound) through.
    unstable_rethrow(error);
    console.error("[appearance] could not resolve the appearance", error);
    return resolveAppearance(DEFAULT_STORED_ORG_APPEARANCE, null);
  }
});
