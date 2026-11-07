import "server-only";

import { cookies } from "next/headers";
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
import { DEFAULT_ORG_APPEARANCE } from "@/lib/ui/themes";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_COOKIE_OPTIONS,
  DEFAULT_USER_PREFERENCES,
  parseAppearanceCookie,
  resolveAppearance,
  serializeAppearanceCookie,
} from "@/lib/ui/preferences";
import { StoredOrgAppearanceSchema } from "@/lib/validation/redesign";

/** `app_settings` key of the org appearance (BE §3.12). */
export const ORG_APPEARANCE_SETTING_KEY = "appearance.theme";

/** The Azul preset at version 1: what a missing or unreadable `appearance.theme` means. */
export const DEFAULT_STORED_ORG_APPEARANCE: StoredOrgAppearance = { ...DEFAULT_ORG_APPEARANCE, v: 1 };

/** Resolver input: `UserPreferences` with the stored, nullable `redesignEnabled`. */
export type StoredUserPreferences = Omit<UserPreferences, "redesignEnabled"> & { redesignEnabled: boolean | null };

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
  const parsed = StoredOrgAppearanceSchema.safeParse((json as { data?: unknown }).data);
  return parsed.success ? parsed.data : null;
}

/**
 * The stored org appearance with its version `v` (per-request cache). On a
 * DB error logs and returns the Azul preset, like `getPrimaryColor`.
 */
export const getStoredOrgAppearance = cache(async (): Promise<StoredOrgAppearance> => {
  try {
    return parseStoredOrgAppearance(await getAppSetting(ORG_APPEARANCE_SETTING_KEY)) ?? DEFAULT_STORED_ORG_APPEARANCE;
  } catch (error) {
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
export function rowToResolverInput(row: UserPreferencesRow | null): StoredUserPreferences | null {
  if (!row) return null;
  return {
    theme: row.theme,
    mode: row.mode,
    style: row.style,
    density: row.density,
    textSize: Number(row.textSize) as TextSize,
    redesignEnabled: row.redesignEnabled,
    quietHours:
      row.quietFrom && row.quietTo ? { from: hourMinute(row.quietFrom), to: hourMinute(row.quietTo) } : null,
  };
}

/**
 * A stored row as `UserPreferences`: defaults when there is no row, and the
 * nullable `redesignEnabled` resolved to the canonical boolean (BE §3.3, §8.1).
 */
export function rowToUserPreferences(row: UserPreferencesRow | null, org: OrgAppearance): UserPreferences {
  const input = rowToResolverInput(row);
  const redesignEnabled = org.redesignAvailable && (input?.redesignEnabled ?? org.redesignDefault);
  return input ? { ...input, redesignEnabled } : { ...DEFAULT_USER_PREFERENCES, redesignEnabled };
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
    console.error("[appearance] could not write the appearance cookie", error);
  }
}

/**
 * The caller's resolved appearance (redesign BE §8.1): reads
 * `appearance.theme` (per-request cache) and the caller's preferences row.
 * The DB is the source of truth; the cookie (`readAppearanceCookie`) is a
 * hint that is ignored when its `v` differs. Guests resolve with no row. On
 * DB errors logs and returns the Azul defaults (flag off), like
 * `getPrimaryColor`.
 */
export const getResolvedAppearance = cache(async (): Promise<ResolvedAppearance> => {
  const org = await getStoredOrgAppearance();
  try {
    const session = await getSession();
    if (!session) return resolveAppearance(org, null);
    const row = await findUserPreferences(db, session.user.id);
    return resolveAppearance(org, rowToResolverInput(row));
  } catch (error) {
    console.error("[appearance] could not resolve the appearance", error);
    return resolveAppearance(DEFAULT_STORED_ORG_APPEARANCE, null);
  }
});
