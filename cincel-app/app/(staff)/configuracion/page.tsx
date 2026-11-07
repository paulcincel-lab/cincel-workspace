import { redirect } from "next/navigation";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function ConfiguracionPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion", searchParams);
  redirect("/configuracion/permisos");
}