import { PersonasContactsScreen } from "@/components/personas/PersonasContacts";
import { preparePersonasContactsPage } from "@/lib/personas/contacts-page.server";
import { Hydrate } from "@/lib/query/hydrate";

/** `/personas/clientes` (redesign FE §3.6): Clientes from the Directorio contacts; `?contacto=<id>` opens the contact sheet. */
export default async function PersonasClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { qc, tab, tipo } = await preparePersonasContactsPage("clientes", await searchParams);
  return (
    <Hydrate qc={qc}>
      <PersonasContactsScreen tab={tab} tipo={tipo} />
    </Hydrate>
  );
}
