import { count, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { importBatches, staff, workspaceGroupMappings } from "@/lib/db/schema";

/** Per-staff first-login wizard flag (#671, #672). */

export async function getOnboardingCompletedAt(staffId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: staff.onboardingCompletedAt })
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);
  return row?.at ?? null;
}

/** Marks the wizard done (finished or skipped). Keeps the first timestamp when it was already set. */
export async function markOnboardingCompleted(staffId: string, at: Date = new Date()): Promise<void> {
  const current = await getOnboardingCompletedAt(staffId);
  if (current) return;
  await db.update(staff).set({ onboardingCompletedAt: at }).where(eq(staff.id, staffId));
}

/** Whether any import batch is `applied` (rolled-back and in-progress runs don't count). */
export async function hasAppliedImport(): Promise<boolean> {
  const [row] = await db
    .select({ id: importBatches.id })
    .from(importBatches)
    .where(eq(importBatches.status, "applied"))
    .limit(1);
  return Boolean(row);
}

export async function countGroupMappings(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(workspaceGroupMappings);
  return Number(row?.n ?? 0);
}
