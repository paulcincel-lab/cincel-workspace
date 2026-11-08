"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import { BIBLIOTECA_SECTIONS } from "@/lib/biblioteca/catalog";
import {
  loadBibliotecaPageData,
  loadMisVacacionesPageData,
  type BibliotecaData,
  type MisVacacionesPageData,
} from "@/lib/loaders/biblioteca";
import { parseInput } from "@/lib/validation/project-flow";

const BibliotecaPageInput = z.object({
  section: z.enum([...BIBLIOTECA_SECTIONS, "empresa"]).nullable(),
});

const MisVacacionesPageInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

/**
 * `qk.biblioteca.links(section)` (Query Migration Phase 8): the viewer's
 * resource capabilities, the links of one Biblioteca screen (section and
 * personal links filtered in SQL) and whether the Drive picker is configured.
 * Auth: staff; `FORBIDDEN` without the section's capability. Read-only.
 */
export async function getBibliotecaPageData(input: z.input<typeof BibliotecaPageInput>): Promise<BibliotecaData> {
  const parsed = parseInput(BibliotecaPageInput, input);
  return loadBibliotecaPageData(await requireCapabilityUser(), parsed);
}

/**
 * The whole of `/biblioteca/vacaciones` in one call (Query Migration Phase
 * 8); the client seeds `me.vacations`, `vacations.absences(month)`,
 * `vacations.pending`, `vacations.settings` and
 * `biblioteca.links('mis-vacaciones')` from it. `deciders` is null for a
 * viewer who may not decide vacations. Auth: staff. Read-only.
 */
export async function getMisVacacionesPageData(
  input: z.input<typeof MisVacacionesPageInput>,
): Promise<MisVacacionesPageData> {
  const parsed = parseInput(MisVacacionesPageInput, input);
  return loadMisVacacionesPageData(await requireCapabilityUser(), parsed);
}
