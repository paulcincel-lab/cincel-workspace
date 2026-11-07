import { notFound } from "next/navigation";

import { PersonaDetail } from "@/components/personas/PersonaDetail";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

import { loadPersonaDetail } from "./load-persona-detail";

/** `/personas/equipo/[id]` (redesign FE §3.6): Persona detalle in the new shell. */
export default async function PersonaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await redirectIfRedesignOff(`/personas/equipo/${encodeURIComponent(id)}`);
  const detail = await loadPersonaDetail(id);
  if (!detail) notFound();
  return <PersonaDetail detail={detail} />;
}
