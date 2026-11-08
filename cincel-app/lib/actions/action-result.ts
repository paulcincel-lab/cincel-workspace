import { unstable_rethrow } from "next/navigation";

import type { ActionResult } from "@/lib/types/schedule";

/**
 * `ActionResult` for user-facing mutations (plan §4.4, #931). Production
 * strips the message of an error thrown by a server action, so the mutations
 * the UI calls return `{ ok: false, error }` with the same `"CODE: detail"`
 * (or Spanish copy) they used to throw; `actionErrorText` maps it as before.
 *
 * Only plain `Error`s become results: Next's control-flow errors (redirect,
 * notFound, dynamic usage) and any other error (database, `TypeError`, …)
 * are rethrown unchanged, so internal messages never reach the client.
 */
export async function toActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && error.constructor === Error) return { ok: false, error: error.message };
    throw error;
  }
}

function isFailed(value: unknown): value is { ok: false; error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

function isWrapped<T>(value: unknown): value is { ok: true; data: T } {
  if (typeof value !== "object" || value === null || (value as { ok?: unknown }).ok !== true) return false;
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes("data");
}

/**
 * The data of an `ActionResult`; throws `new Error(error)` for a failed one,
 * so callers that used to catch the thrown action error keep working. Same
 * rules as `runAction` (`lib/query/mutation.ts`): any other value passes
 * through unchanged.
 */
export function unwrapActionResult<T>(result: ActionResult<T>): T {
  if (isFailed(result)) throw new Error(result.error);
  if (isWrapped<T>(result)) return result.data;
  return result as unknown as T;
}
