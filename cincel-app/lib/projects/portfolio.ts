/**
 * Portfolio read for a signed-in user (redesign BE §7.12, §9.7). Admin-only
 * data is decided here through `lib/tramos/compat.ts`, the redesign's single
 * entry to Project Flow admin concepts.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { listPortfolioRows } from "@/lib/repositories/projects-portfolio-repository";
import { canSeeAdminData } from "@/lib/tramos/compat";
import type { PortfolioRow } from "@/lib/types/redesign";

export async function portfolioFor(user: AuthenticatedUser, now: Date = new Date()): Promise<PortfolioRow[]> {
  return listPortfolioRows({ includeAdminData: canSeeAdminData(user), now });
}
