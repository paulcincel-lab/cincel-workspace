import { redirect } from "next/navigation";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

/**
 * Legacy route — Clientes is now part of the unified Directorio page.
 * This redirect prevents dead-link 404s for any bookmarked URL.
 */
export default async function ClientesLegacyPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/clientes", searchParams);
  redirect("/directorio");
}
