import "server-only";

import { db } from "@/lib/db/client";
import { authEvents } from "@/lib/db/schema";
import type { DirectoryError } from "@/lib/google/directory";

/**
 * Directory failures are written to `auth_events` so Configuración → Google →
 * Estado can show the last one (BE §A.7). Each source has its own kind; the
 * reason is the error kind plus the HTTP status, e.g. `http 403`.
 */
export const DIRECTORY_ERROR_EVENT_KINDS = {
  signIn: "staff_login_error",
  groupMapping: "group_mapping_error",
  recheck: "staff_recheck_error",
} as const;

export type DirectoryErrorSource = keyof typeof DIRECTORY_ERROR_EVENT_KINDS;

/** `timeout`, `network` or `http 403`. */
export function directoryErrorReason(error: Pick<DirectoryError, "kind" | "status">): string {
  return error.status ? `${error.kind} ${error.status}` : error.kind;
}

type Executor = Pick<typeof db, "insert">;

/** Records a Directory failure. Never throws: logging must not break sign-in or the re-check. */
export async function recordDirectoryError(
  source: DirectoryErrorSource,
  error: Pick<DirectoryError, "kind" | "status">,
  values: { staffId?: string | null; email?: string | null } = {},
  executor: Executor = db,
): Promise<void> {
  try {
    await executor.insert(authEvents).values({
      kind: DIRECTORY_ERROR_EVENT_KINDS[source],
      staffId: values.staffId ?? null,
      email: values.email ?? null,
      reason: directoryErrorReason(error),
    });
  } catch (logError) {
    console.error("[auth-events] could not record a Directory error", logError);
  }
}
