import { redirect } from "next/navigation";

/**
 * Legacy route — Contratistas is now part of the unified Directorio page.
 * This redirect prevents dead-link 404s for any bookmarked URL.
 */
export default function ContratistasLegacyPage() {
  redirect("/directorio");
}
