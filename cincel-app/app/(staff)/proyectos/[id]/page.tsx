import { redirect } from "next/navigation";

/** A bare project link (`/proyectos/<id>`) opens the project's Ficha instead of a 404. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/proyectos/${encodeURIComponent(id)}/ficha`);
}
