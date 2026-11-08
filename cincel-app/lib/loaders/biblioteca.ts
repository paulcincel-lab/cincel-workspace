import "server-only";

import { currentMonth, todayIso } from "@/components/biblioteca/vacation-format";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { BibliotecaLinksSection } from "@/lib/biblioteca/catalog";
import { loadBibliotecaData, type BibliotecaData } from "@/lib/biblioteca/load";
import type { TeamAbsence } from "@/lib/types/redesign";
import { loadVacationDeciderData, type VacationDeciderData } from "@/lib/vacations/decider-sections";
import { readMyVacations, readTeamAbsences, type MyVacations } from "@/lib/vacations/reads";

export type { BibliotecaData } from "@/lib/biblioteca/load";
export type { VacationDeciderData } from "@/lib/vacations/decider-sections";

/**
 * `qk.biblioteca.links(section)` loader (Query Migration Phase 8): `/biblioteca`
 * (null), `/biblioteca/[seccion]`, `/biblioteca/empresa/[doc]` ("empresa")
 * and the Mis vacaciones documents. `getBibliotecaPageData` calls it after
 * the session check and a server page calls it directly. Section and
 * personal-link filters run in SQL; `FORBIDDEN` without the capability.
 */
export async function loadBibliotecaPageData(
  user: AuthenticatedUser,
  input: { section: BibliotecaLinksSection | null },
): Promise<BibliotecaData> {
  return loadBibliotecaData(user, input.section);
}

/** Everything `/biblioteca/vacaciones` shows, read in one wave. */
export type MisVacacionesPageData = {
  /** Null while `fetchMyVacationsAction` is a stub (balance and history hidden). */
  mine: MyVacations | null;
  /** "YYYY-MM" of the team strip. */
  month: string;
  /** Null while `fetchTeamAbsencesAction` is a stub (strip hidden). */
  absences: TeamAbsence[] | null;
  /** `biblioteca.links('mis-vacaciones')`: the old section's documents. */
  library: BibliotecaData;
  /** Year of the balance, for the description. */
  year: number;
  /** Null for a viewer who may not decide vacations: no pending requests of others, no settings. */
  deciders: VacationDeciderData | null;
};

/**
 * `getMisVacacionesPageData` loader: the viewer's vacations, the team
 * absences of `month` (default: this month in Mexico City), the
 * `mis-vacaciones` documents and, for deciders only, the pending requests and
 * the settings, all in **one** `Promise.all` (it used to take three waves).
 * Reads whose action is still a stub (`IMPLEMENTED` false) come back null.
 */
export async function loadMisVacacionesPageData(
  user: AuthenticatedUser,
  input: { month?: string },
  now: Date = new Date(),
): Promise<MisVacacionesPageData> {
  const month = input.month ?? currentMonth(now);
  const [mine, absences, library, deciders] = await Promise.all([
    IMPLEMENTED.fetchMyVacationsAction ? readMyVacations(user) : Promise.resolve(null),
    IMPLEMENTED.fetchTeamAbsencesAction ? readTeamAbsences(user, month) : Promise.resolve(null),
    loadBibliotecaData(user, "mis-vacaciones"),
    loadVacationDeciderData(user),
  ]);
  return { mine, month, absences, library, year: Number(todayIso(now).slice(0, 4)), deciders };
}
