import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";

export async function getAppSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

/** A setting with the time it was last saved, or null when it isn't stored. */
export async function getAppSettingEntry(key: string): Promise<{ value: string; updatedAt: Date } | null> {
  const [row] = await db
    .select({ value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return row ?? null;
}

/** Store a setting, or remove it (back to the default) with `null`. Returns the save time (null on removal). */
export async function setAppSetting(key: string, value: string | null): Promise<Date | null> {
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return null;
  }
  const [row] = await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
    .returning({ updatedAt: appSettings.updatedAt });
  return row?.updatedAt ?? null;
}
