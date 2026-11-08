/**
 * `app_settings('appearance.theme')` (redesign BE §3.12, §4, §8.2): the org
 * appearance stored as `{ version: 1, data: StoredOrgAppearance }`, where
 * `data.v` is bumped on every save so cookies rendered from an older
 * appearance are ignored on the next load.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import type { OrgAppearance, StoredOrgAppearance } from "@/lib/types/redesign";
import { StoredOrgAppearanceSchema, withoutRetiredOrgAppearanceKeys } from "@/lib/validation/redesign";

export const ORG_APPEARANCE_SETTING_KEY = "appearance.theme";

/** The stored value, or null when the row is missing or does not parse. */
export function parseStoredOrgAppearance(raw: string | null): StoredOrgAppearance | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; data?: unknown };
    if (parsed?.version !== 1) return null;
    const result = StoredOrgAppearanceSchema.safeParse(withoutRetiredOrgAppearanceKeys(parsed.data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** The version `v` of a raw stored value, even when the rest no longer parses (0 when absent). */
function storedVersion(raw: string | null): number {
  if (raw === null) return 0;
  try {
    const v = (JSON.parse(raw) as { data?: { v?: unknown } })?.data?.v;
    return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function serializeStoredOrgAppearance(value: StoredOrgAppearance): string {
  return JSON.stringify({ version: 1, data: value });
}

export async function readStoredOrgAppearance(): Promise<StoredOrgAppearance | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, ORG_APPEARANCE_SETTING_KEY));
  return parseStoredOrgAppearance(row?.value ?? null);
}

/**
 * Replace the org appearance, computed from the current stored value (null
 * when missing or unreadable), and bump `v`. The row is locked for the
 * duration so two concurrent saves never reuse the same `v`.
 */
export async function writeOrgAppearance(
  next: (current: StoredOrgAppearance | null) => OrgAppearance,
): Promise<StoredOrgAppearance> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, ORG_APPEARANCE_SETTING_KEY))
      .for("update");
    const raw = row?.value ?? null;
    const stored: StoredOrgAppearance = { ...next(parseStoredOrgAppearance(raw)), v: storedVersion(raw) + 1 };
    const value = serializeStoredOrgAppearance(stored);
    await tx
      .insert(appSettings)
      .values({ key: ORG_APPEARANCE_SETTING_KEY, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
    return stored;
  });
}
