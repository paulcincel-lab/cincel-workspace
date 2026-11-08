import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacy } from "@/lib/ui/legacy-redirects-server";

/** Old route (FE §2.2): redirects to its redesign page, query string preserved. */
export default async function ProveedoresTiendasPage({ searchParams }: LegacyPageProps) {
  return redirectLegacy("/proveedores/tiendas", searchParams);
}
