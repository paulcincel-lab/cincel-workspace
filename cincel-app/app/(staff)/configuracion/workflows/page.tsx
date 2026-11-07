import { redirect } from "next/navigation";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

/** Workflows became "Tramos y fases". */
export default async function ConfiguracionWorkflowsPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/workflows", searchParams);
  redirect("/configuracion/tramos");
}
