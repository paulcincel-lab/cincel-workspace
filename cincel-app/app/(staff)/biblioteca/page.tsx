import { BibliotecaIndex } from "@/components/biblioteca/BibliotecaIndex";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { parseEstilo } from "@/lib/biblioteca/catalog";
import { loadBibliotecaData } from "@/lib/biblioteca/load";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/biblioteca` (redesign FE §3.7): Empresa + Recursos catalog in the new
 * shell. Reads the existing resource actions; personal links and Empresa are
 * filtered for the viewer on the server.
 */
export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  const { links, capabilities } = await loadBibliotecaData();
  const view = <BibliotecaIndex links={links} showEmpresa={capabilities.enterprise.canView} />;
  const estilo = parseEstilo(sp.estilo);
  return estilo ? (
    <StyleProvider style={estilo} scope="staff" isOverridden>
      {view}
    </StyleProvider>
  ) : (
    view
  );
}
