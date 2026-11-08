"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  loadPersonasContacts,
  loadPersonasCounts,
  loadPersonasEquipo,
  type PersonasContactsData,
  type PersonasEquipoData,
} from "@/lib/loaders/personas";
import type { PersonasTab } from "@/lib/personas/team";
import { parseInput } from "@/lib/validation/project-flow";

/**
 * Personas page data (Query Migration 6, #940), one per `qk.personas` key.
 * Each one parses its input, requires a staff session (a guest gets
 * FORBIDDEN) and hands the viewer to its loader, which checks the Personas
 * capability (FORBIDDEN without it) and strips what the viewer may not see.
 * Read-only: no revalidation, no writes. The detail read is
 * `fetchPersonaDetailAction` (`lib/actions/people-actions.ts`).
 */

const EmptyInput = z.object({});
const ContactsInput = z.object({
  tab: z.enum(["clientes", "contratistas", "proveedores"]),
  tipo: z.string().max(40).nullish(),
});

/** `qk.personas.equipo()`: the team cards of `/personas`. `team.canViewTeam`. */
export async function getPersonasEquipoPageData(input: z.input<typeof EmptyInput> = {}): Promise<PersonasEquipoData> {
  parseInput(EmptyInput, input);
  return loadPersonasEquipo(await requireCapabilityUser());
}

/** `qk.personas.counts()`: the four tab badges; 0 for a tab the viewer can't open. */
export async function getPersonasCountsAction(
  input: z.input<typeof EmptyInput> = {},
): Promise<Record<PersonasTab, number>> {
  parseInput(EmptyInput, input);
  return loadPersonasCounts(await requireCapabilityUser());
}

/** `qk.personas.contacts(tab, tipo)`: one contacts tab, its own types only. `clients.canViewClients`. */
export async function getPersonasContactsPageData(input: z.input<typeof ContactsInput>): Promise<PersonasContactsData> {
  const parsed = parseInput(ContactsInput, input);
  return loadPersonasContacts(await requireCapabilityUser(), parsed);
}
