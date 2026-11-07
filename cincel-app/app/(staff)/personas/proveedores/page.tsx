import { PersonasContacts } from "@/components/personas/PersonasContacts";
import { loadPersonasContactsPage } from "@/lib/personas/contacts-page.server";

/** `/personas/proveedores` (redesign FE §3.6): Proveedores from the Directorio contacts; `?contacto=<id>` opens the contact sheet. */
export default async function PersonasProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const props = await loadPersonasContactsPage("proveedores", await searchParams);
  return <PersonasContacts {...props} />;
}
