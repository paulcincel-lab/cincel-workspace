import { PersonasContacts } from "@/components/personas/PersonasContacts";
import { loadPersonasContactsPage } from "@/lib/personas/contacts-page.server";

/** `/personas/contratistas` (redesign FE §3.6): Contratistas from the Directorio contacts; `?contacto=<id>` opens the contact sheet. */
export default async function PersonasContratistasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const props = await loadPersonasContactsPage("contratistas", await searchParams);
  return <PersonasContacts {...props} />;
}
