import { redirect } from "next/navigation";

/**
 * Legacy route — Colaboradores is now part of the unified Directorio page.
 * This redirect prevents dead-link 404s for any bookmarked URL.
 */
export default function ColaboradoresLegacyPage() {
  redirect("/directorio");
}
