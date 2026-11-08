import { PersonasContactsScreen } from "@/components/personas/PersonasContacts";
import { preparePersonasContactsPage } from "@/lib/personas/contacts-page.server";
import { Hydrate } from "@/lib/query/hydrate";

/** `/personas/contratistas` (redesign FE §3.6): Contratistas from the Directorio contacts; `?contacto=<id>` opens the contact sheet. */
export default async function PersonasContratistasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { qc, tab, tipo } = await preparePersonasContactsPage("contratistas", await searchParams);
  return (
    <Hydrate qc={qc}>
      <PersonasContactsScreen tab={tab} tipo={tipo} />
    </Hydrate>
  );
}
