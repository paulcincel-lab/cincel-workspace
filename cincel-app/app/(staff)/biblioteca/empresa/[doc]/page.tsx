import { notFound } from "next/navigation";

import { DocumentReader } from "@/components/biblioteca/DocumentReader";
import { EmptyState } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { canViewResourceSection } from "@/lib/auth/permissions";
import { documentToc, empresaDoc, empresaDocLinks, pickDocumentPart } from "@/lib/biblioteca/catalog";
import { loadBibliotecaData } from "@/lib/biblioteca/load";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/biblioteca/empresa/[doc]` (redesign FE §3.7): a company document (`book`,
 * `manual-de-la-empresa`, `imagen-de-la-empresa`, `rfc`,
 * `politicas-de-la-empresa`) in `DocumentReader`; `?parte=<id>` picks the
 * part. Auth: `canViewResourceSection("empresa")`.
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

  const { links, capabilities, driveEnabled } = await loadBibliotecaData();
  if (!canViewResourceSection({ capabilities, section: "empresa" })) notFound();

  const parts = empresaDocLinks(links, doc.slug);
  const parte = Array.isArray(sp.parte) ? sp.parte[0] : sp.parte;
  const current = pickDocumentPart(parts, parte);

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={doc.title}
          description={doc.description}
          breadcrumb={[{ label: "Biblioteca", href: "/biblioteca" }, { label: "Empresa", href: "/biblioteca" }, { label: doc.title }]}
        />
        <EmptyState
          title={`Aún no hay documentos en ${doc.title}`}
          description="Cuando Dirección agregue el documento aparecerá aquí."
          action={{ label: "Volver a la biblioteca", href: "/biblioteca" }}
        />
      </div>
    );
  }

  return (
    <DocumentReader
      doc={current}
      toc={documentToc(parts, doc)}
      companyDoc={{ slug: doc.slug, title: doc.title, description: doc.description }}
      driveEnabled={driveEnabled}
    />
  );
}
