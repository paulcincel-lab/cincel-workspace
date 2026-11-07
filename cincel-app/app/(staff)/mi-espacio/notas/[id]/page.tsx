import { redirect } from "next/navigation";

/**
 * Canonical note link (FE §2.2, RD-14): search results and notifications link
 * `/mi-espacio/notas/<id>`; the note opens in the editor over Mi espacio.
 */
export default async function NotaLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/mi-espacio?${new URLSearchParams({ nota: id }).toString()}`);
}
