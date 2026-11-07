import "server-only";

import type { MisVacacionesClientProps } from "@/components/biblioteca/MisVacacionesClient";
import type { VacationDocument } from "@/components/biblioteca/VacationDocuments";
import { currentMonth, todayIso } from "@/components/biblioteca/vacation-format";
import { fetchResourceLinksAction } from "@/lib/actions/resources-actions";
import { fetchMyVacationsAction, fetchTeamAbsencesAction } from "@/lib/actions/vacations-actions";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { requireCapabilityUser } from "@/lib/auth/session";
import type { ResourceLink } from "@/lib/types/resource";

/**
 * Data of `/biblioteca/vacaciones` (redesign FE §3.7) in one pass: the
 * caller's balance and requests, the team absences of the current month and
 * the `mis-vacaciones` resource rows. Reads whose action is still a stub
 * (`IMPLEMENTED` false) come back null so the page hides that section.
 * Personal resource rows of other people are filtered out here, on the server.
 */
export async function loadMisVacaciones(now: Date = new Date()): Promise<MisVacacionesClientProps> {
  const user = await requireCapabilityUser();
  const month = currentMonth(now);
  const [mine, absences, links] = await Promise.all([
    IMPLEMENTED.fetchMyVacationsAction ? fetchMyVacationsAction() : Promise.resolve(null),
    IMPLEMENTED.fetchTeamAbsencesAction ? fetchTeamAbsencesAction({ month }) : Promise.resolve(null),
    fetchResourceLinksAction({ section: "mis-vacaciones" }),
  ]);
  return {
    mine,
    month,
    absences,
    documents: vacationDocuments(links, user.member.id),
    year: Number(todayIso(now).slice(0, 4)),
  };
}

/** Shared rows plus the viewer's own personal rows of section `mis-vacaciones`. */
export function vacationDocuments(links: ResourceLink[], viewerId: string): VacationDocument[] {
  return links
    .filter((link) => link.section === "mis-vacaciones")
    .filter((link) => !link.personalFor || link.personalFor.id === viewerId)
    .map((link) => ({ id: link.id, title: link.title, url: link.url, updatedAt: link.updatedAt }));
}
