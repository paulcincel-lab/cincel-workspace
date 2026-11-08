import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacy } from "@/lib/ui/legacy-redirects-server";

/** Old route (FE §2.2): redirects to its redesign page, query string preserved. */
export default async function CalendarioPage({ searchParams }: LegacyPageProps) {
  return redirectLegacy("/calendario", searchParams);
}
