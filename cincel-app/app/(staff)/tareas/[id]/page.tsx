import { redirect } from "next/navigation";

/**
 * Canonical task link (FE §2.2, RD-14): search results and notifications link
 * `/tareas/<id>`; the task opens as a sheet over the mounted Tareas view.
 */
export default async function TareaLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tareas?${new URLSearchParams({ tarea: id }).toString()}`);
}
