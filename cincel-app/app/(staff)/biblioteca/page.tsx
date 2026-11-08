import { BibliotecaIndex } from "@/components/biblioteca/BibliotecaIndex";
import { loadBibliotecaData } from "@/lib/biblioteca/load";

/**
 * `/biblioteca` (redesign FE §3.7): Empresa + Recursos catalog in the new
 * shell. Reads the existing resource actions; personal links and Empresa are
 * filtered for the viewer on the server.
 */
export default async function BibliotecaPage() {
  const { links, capabilities } = await loadBibliotecaData();
  return <BibliotecaIndex links={links} showEmpresa={capabilities.enterprise.canView} />;
}
