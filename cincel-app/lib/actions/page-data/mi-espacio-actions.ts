"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import { loadMiEspacio } from "@/lib/loaders/mi-espacio";
import { listChecklistsPage, listNotesPage } from "@/lib/my-space/notes-checklists";
import type { MiEspacioPageData, MySpaceListPage } from "@/lib/types/mi-espacio";
import type { Checklist, Note } from "@/lib/types/redesign";
import { parseInput } from "@/lib/validation/project-flow";

const MiEspacioPageInput = z.object({});
const MiEspacioCursorInput = z.object({ cursor: z.string().regex(/^\d{1,9}$/).nullable().optional() }).strict();

/**
 * `/mi-espacio` page data (Query Migration Phase 7, #941): requires a staff
 * session (a guest gets FORBIDDEN) and hands the viewer to `loadMiEspacio`,
 * which reads only the viewer's own rows. Read-only. The client seeds the
 * granular `me.*` keys from it (`prefetchMiEspacio`).
 */
export async function getMiEspacioPageData(input: z.input<typeof MiEspacioPageInput>): Promise<MiEspacioPageData> {
  parseInput(MiEspacioPageInput, input ?? {});
  return loadMiEspacio(await requireCapabilityUser());
}

/** `me.notes` page ("Ver más"): the caller's live notes from `cursor`. Read-only. Errors: `INVALID`. */
export async function fetchMiEspacioNotesPage(
  input: z.input<typeof MiEspacioCursorInput>,
): Promise<MySpaceListPage<Note>> {
  const { cursor } = parseInput(MiEspacioCursorInput, input ?? {});
  return listNotesPage(await requireCapabilityUser(), { cursor });
}

/** `me.checklists` page ("Ver más"): the caller's live checklists from `cursor`. Read-only. Errors: `INVALID`. */
export async function fetchMiEspacioChecklistsPage(
  input: z.input<typeof MiEspacioCursorInput>,
): Promise<MySpaceListPage<Checklist>> {
  const { cursor } = parseInput(MiEspacioCursorInput, input ?? {});
  return listChecklistsPage(await requireCapabilityUser(), { cursor });
}
