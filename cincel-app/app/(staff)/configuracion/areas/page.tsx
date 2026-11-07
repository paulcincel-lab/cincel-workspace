import { redirect } from "next/navigation";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

/** Áreas were replaced by Puestos (ADR 0003); old links land on the new page. */
export default async function ConfiguracionAreasPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/areas", searchParams);
  redirect("/configuracion/puestos");
}
