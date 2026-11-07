/**
 * Whether the server-thread assistant actions are implemented (redesign FE
 * §9 stubs rule, §20 Rule 1). The full `/asistente` page and its nav item
 * stay on the legacy chat / hidden while any `IMPLEMENTED` flag of
 * `assistant-actions.flags.ts` is false. Client-safe.
 */
import { IMPLEMENTED } from "@/lib/actions/assistant-actions.flags";

export function assistantThreadsReady(flags: Readonly<Record<string, boolean>> = IMPLEMENTED): boolean {
  return Object.values(flags).every(Boolean);
}
