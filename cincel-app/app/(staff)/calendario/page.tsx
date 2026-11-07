import CalendarWorkspace from "@/components/calendario/CalendarWorkspace";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function CalendarioPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/calendario", searchParams);
  return <CalendarWorkspace />;
}
