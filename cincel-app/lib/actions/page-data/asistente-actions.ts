"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  loadAsistentePageData,
  loadAsistenteThread,
  loadAssistantContextLabel,
} from "@/lib/loaders/asistente";
import type { AsistentePageData, AsistentePageThread, AssistantContextLabel } from "@/lib/types/asistente";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

/**
 * Asistente page data (Query Migration Phase 10, #944), one per
 * `qk.asistente` key. Each one parses its input, requires a staff session (a
 * guest gets FORBIDDEN) and hands the viewer to its loader. Owner-only and
 * read-only: another user's thread reads as null, never its messages.
 */

const PageInput = z.object({ threadId: UuidSchema.nullable() });
const ContextInput = z.object({
  projectId: UuidSchema.optional(),
  taskId: UuidSchema.optional(),
  personId: UuidSchema.optional(),
});

/** `/asistente` in one call: the threads (≤ 50) and the `?thread=` thread with its last messages. */
export async function getAsistentePageData(input: z.input<typeof PageInput>): Promise<AsistentePageData> {
  const parsed = parseInput(PageInput, input);
  return loadAsistentePageData(await requireCapabilityUser(), parsed);
}

/** `qk.asistente.thread(id)`: the caller's own thread, or null (missing, deleted, someone else's, not a uuid). */
export async function fetchAssistantThreadAction(id: string): Promise<AsistentePageThread | null> {
  const user = await requireCapabilityUser();
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) return null;
  return loadAsistenteThread(user, { id: parsed.data });
}

/**
 * `qk.asistente.context(c)`: the "Viendo:" chip. Name-only `{ id, label }`
 * of the most specific id the viewer can see (task, person, project), or null.
 */
export async function lookupAssistantContextAction(
  input: z.input<typeof ContextInput>,
): Promise<AssistantContextLabel | null> {
  const parsed = parseInput(ContextInput, input);
  return loadAssistantContextLabel(await requireCapabilityUser(), parsed);
}
