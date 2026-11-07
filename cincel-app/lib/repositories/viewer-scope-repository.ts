import { eq } from "drizzle-orm";

import { isStaffAdministrator } from "@/lib/auth/access-role";
import { db } from "@/lib/db/client";
import { staff } from "@/lib/db/schema";
import type { ViewerScope } from "@/lib/types/core";

/**
 * Viewer scope of a staff member without a session (calendar feed, Google
 * Calendar sync): administrator from `staff.role` + email, as the session
 * resolves it. A missing staff row is a non-admin scope.
 */
export async function staffViewerScope(staffId: string): Promise<ViewerScope> {
  const [row] = await db.select({ role: staff.role, email: staff.email }).from(staff).where(eq(staff.id, staffId)).limit(1);
  return { staffId, isAdmin: row ? isStaffAdministrator(row.role, row.email) : false };
}
