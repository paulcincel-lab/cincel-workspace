import { PersonasContactsScreen } from "@/components/personas/PersonasContacts";
import { preparePersonasContactsPage } from "@/lib/personas/contacts-page.server";
import { Hydrate } from "@/lib/query/hydrate";

/** `/personas/proveedores` (redesign FE §3.6): Proveedores from the Directorio contacts; `?contacto=<id>` opens the contact sheet. */
export default async function PersonasProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { qc, tab, tipo } = await preparePersonasContactsPage("proveedores", await searchParams);
  return (
    <Hydrate qc={qc}>
      <PersonasContactsScreen tab={tab} tipo={tipo} />
    </Hydrate>
  );
}
