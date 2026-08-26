import { redirect } from "next/navigation";

/**
 * Legacy route — the canonical Contratistas page lives at
 * /proveedores/contratistas (the Sidebar link target).
 * This redirect prevents dead-link 404s for any bookmarked URL.
 */
export default function ContratistasLegacyPage() {
  redirect("/proveedores/contratistas");
}
