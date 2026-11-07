import { PersonasContacts } from "@/components/personas/PersonasContacts";
import { loadPersonasContactsPage } from "@/lib/personas/contacts-page.server";

/** `/personas/clientes` (redesign FE §3.6): Clientes from the Directorio contacts; `?contacto=<id>` opens the contact sheet. */
export default async function PersonasClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const props = await loadPersonasContactsPage("clientes", await searchParams);
  return <PersonasContacts {...props} />;
}
