"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import { loadInicioPage, type InicioPageData } from "@/lib/loaders/inicio";
import { parseInput } from "@/lib/validation/project-flow";

export type { InicioPageData } from "@/lib/loaders/inicio";

/** No input: the key stays `qk.inicio()` (the sidebar hover prefetch passes `{}` too). */
const InicioPageInput = z.object({});

/**
 * `qk.inicio()` (Query Migration Phase 3, #937): every Inicio widget and the
 * Google setup banner flag in one call. Requires a staff session (a guest
 * gets FORBIDDEN) and hands the viewer to the loader, which scopes every
 * widget to them. Read-only.
 */
export async function getInicioPageData(input: z.input<typeof InicioPageInput>): Promise<InicioPageData> {
  parseInput(InicioPageInput, input);
  return loadInicioPage(await requireCapabilityUser());
}
