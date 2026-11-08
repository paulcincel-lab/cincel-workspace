import { notFound } from "next/navigation";

import { EmpresaDocument } from "@/components/biblioteca/DocumentReader";
import { canViewResourceSection, resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { empresaDoc } from "@/lib/biblioteca/catalog";
import { requireBibliotecaViewer } from "@/lib/biblioteca/load";
import type { DriveStatus } from "@/lib/google/use-drive-status";
import { loadBibliotecaPageData } from "@/lib/loaders/biblioteca";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { getQueryClient } from "@/lib/query/server";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/biblioteca/empresa/[doc]` (redesign FE §3.7): a company document (`book`,
 * `manual-de-la-empresa`, `imagen-de-la-empresa`, `rfc`,
 * `politicas-de-la-empresa`) in `DocumentReader`; `?parte=<id>` picks the
 * part. Auth: `canViewResourceSection("empresa")`. Reads
 * `biblioteca.links('empresa')`, prefetched here with the loader.
 */
export default async function BibliotecaDocumentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ doc: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ doc: slug }, sp] = await Promise.all([params, searchParams]);

  const doc = empresaDoc(slug);
  if (!doc) notFound();

  const user = await requireBibliotecaViewer();
  if (!canViewResourceSection({ capabilities: resolveResourcesCapabilities(user), section: "empresa" })) notFound();

  const qc = getQueryClient();
  const data = await loadBibliotecaPageData(user, { section: "empresa" });
  qc.setQueryData(bibliotecaLinksOptions("empresa").queryKey, data);
  qc.setQueryData<DriveStatus>(qk.google.driveStatus(), { configured: data.driveEnabled });

  const parte = Array.isArray(sp.parte) ? sp.parte[0] : sp.parte;
  return (
    <Hydrate qc={qc}>
      <EmpresaDocument slug={doc.slug} parte={parte ?? null} />
    </Hydrate>
  );
}
