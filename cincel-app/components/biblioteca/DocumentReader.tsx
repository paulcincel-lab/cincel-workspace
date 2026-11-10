"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import type { DriveBrowserEntry } from "@/components/recursos/DriveBrowser";
import { DriveFilePreviewSheet, ResourcePreview } from "@/components/recursos/ResourcePreview";
import { EmptyState } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { IMPLEMENTED as ASSISTANT_IMPLEMENTED } from "@/lib/actions/assistant-actions.flags";
import {
  documentToc,
  empresaDoc,
  empresaDocHref,
  empresaDocLinks,
  pickDocumentPart,
  resourceDownload,
  shortDate,
  type EmpresaDocSlug,
} from "@/lib/biblioteca/catalog";
import { useDriveStatus } from "@/lib/google/use-drive-status";
import { bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { useAssistantUi } from "@/lib/stores/assistant-ui-store";
import { useRecentDocs } from "@/lib/stores/recent-docs-store";
import type { ResourceLink } from "@/lib/types/resource";
import { cn } from "@/lib/utils";

export type DocumentReaderProps = {
  /** The part being read (one resource link of the company document). */
  doc: ResourceLink;
  /** Every part of the document, in order; `id` is the resource link id. */
  toc: { id: string; label: string }[];
  /** The company document the parts belong to (breadcrumb, title, links). */
  companyDoc?: { slug: EmpresaDocSlug; title: string; description?: string };
};

/**
 * The assistant sheet is offered only once every assistant action is
 * implemented (Phase 7, `assistant-actions.flags.ts`); until then the entry
 * point is not rendered, so nothing reaches a stub.
 */
export function isAssistantAvailable(): boolean {
  return Object.values(ASSISTANT_IMPLEMENTED).every(Boolean);
}

/**
 * Company document reader (redesign FE §3.7, frame `BibliotecaDocumento`):
 * extends the Recursos workspace viewer with a left TOC (one entry per part,
 * linked by `?parte=`), the reading column (the workspace preview of the part)
 * and a right panel (actualizado, por, estado, "Descargar PDF", and
 * "Preguntar al asistente sobre este documento" while the assistant flags are
 * on). "Preguntar" opens the shell's one assistant sheet (`useAssistantUi`)
 * with the document's route as context; the reader mounts no sheet of its
 * own. Drive (preview, download) comes from `useDriveStatus()`.
 */
export function DocumentReader({ doc, toc, companyDoc }: DocumentReaderProps) {
  const [drivePreview, setDrivePreview] = useState<DriveBrowserEntry | null>(null);
  const { configured: driveEnabled } = useDriveStatus();
  const remember = useRecentDocs((state) => state.remember);

  const title = companyDoc?.title ?? doc.title;
  const hrefFor = (id: string) => (companyDoc ? empresaDocHref(companyDoc.slug, id) : `?parte=${encodeURIComponent(id)}`);
  const index = Math.max(0, toc.findIndex((entry) => entry.id === doc.id));
  const previous = index > 0 ? toc[index - 1] : null;
  const next = index < toc.length - 1 ? toc[index + 1] : null;
  const download = resourceDownload(doc, driveEnabled);
  const assistant = isAssistantAvailable();
  const route = companyDoc ? empresaDocHref(companyDoc.slug, doc.id) : "/biblioteca";

  // Remember the part in "Abiertos recientemente" each time one is opened.
  const companySlug = companyDoc?.slug;
  useEffect(() => {
    remember(doc, companySlug ? { href: empresaDocHref(companySlug, doc.id) } : {});
  }, [remember, doc, companySlug]);

  const downloadButton = download ? (
    <a href={download.href} className={buttonVariants({ variant: "outline" })}>
      <Download aria-hidden="true" />
      {download.label}
    </a>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        estilo={false}
        title={title}
        description={companyDoc?.description}
        breadcrumb={[{ label: "Biblioteca", href: "/biblioteca" }, { label: "Empresa", href: "/biblioteca" }, { label: title }]}
        actions={downloadButton}
      />

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <nav aria-label="Contenido" className="w-full shrink-0 lg:w-60">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-xs font-medium text-muted-foreground">Contenido</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-0.5">
                {toc.map((entry, i) => {
                  const active = entry.id === doc.id;
                  return (
                    <li key={entry.id}>
                      <a
                        href={hrefFor(entry.id)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
                          "h-auto w-full justify-start gap-2 py-1.5 text-left whitespace-normal",
                        )}
                      >
                        <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0">{entry.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </nav>

        <article aria-labelledby="documento-parte" className="w-full min-w-0 flex-1">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <span className="text-xs text-muted-foreground">Sección {index + 1}</span>
              <h2 id="documento-parte" className="text-lg font-semibold text-foreground">
                {toc[index]?.label ?? doc.title}
              </h2>
            </CardHeader>
            <ResourcePreview
              link={doc}
              title={title}
              unavailableReason={
                doc.linkType === "web"
                  ? "El enlace seleccionado es tipo web y no admite vista previa embebida."
                  : "No se pudo generar vista previa. Verifica que sea un enlace válido y compartido de Google Drive o Google Docs."
              }
              onDriveFileClick={setDrivePreview}
              heightClass="h-[720px]"
            />
            {previous || next ? (
              <nav aria-label="Secciones" className="flex flex-wrap justify-between gap-2 border-t border-border p-4">
                {previous ? (
                  <a href={hrefFor(previous.id)} className={buttonVariants({ variant: "link", size: "sm" })}>
                    <ChevronLeft aria-hidden="true" />
                    {index}. {previous.label}
                  </a>
                ) : (
                  <span />
                )}
                {next ? (
                  <a href={hrefFor(next.id)} className={buttonVariants({ variant: "link", size: "sm" })}>
                    {index + 2}. {next.label}
                    <ChevronRight aria-hidden="true" />
                  </a>
                ) : null}
              </nav>
            ) : null}
          </Card>
        </article>

        <aside aria-label="Detalles del documento" className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Actualizado</dt>
                  <dd className="font-mono">{shortDate(doc.updatedAt)}</dd>
                </div>
                {doc.owner ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Por</dt>
                    <dd className="text-right">{doc.owner.name}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd>{doc.status === "obsoleto" ? "Obsoleto" : "Vigente"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Visible para</dt>
                  <dd className="text-right">{doc.personalFor ? doc.personalFor.name : "Todo el equipo"}</dd>
                </div>
              </dl>
              <div className="flex flex-col gap-2">
                {downloadButton}
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
                  {doc.linkType === "web" ? "Abrir enlace" : "Abrir en Drive"}
                </a>
              </div>
            </CardContent>
          </Card>

          {assistant ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles aria-hidden="true" className="size-4" />
                  Preguntar al asistente
                </CardTitle>
                <CardDescription>Haz preguntas sobre este documento y recibe la respuesta con la sección exacta.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full whitespace-normal"
                  onClick={() => useAssistantUi.getState().openAssistant({ context: { route } })}
                >
                  Preguntar al asistente sobre este documento
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      <DriveFilePreviewSheet entry={drivePreview} onClose={() => setDrivePreview(null)} />
    </div>
  );
}

const NO_LINKS: ResourceLink[] = [];

export type EmpresaDocumentProps = {
  slug: EmpresaDocSlug;
  /** `?parte=`: the part to show; the first one when absent or not part of the document. */
  parte: string | null;
};

/**
 * `/biblioteca/empresa/[doc]` (redesign FE §3.7): the company document's
 * parts from `biblioteca.links('empresa')` (prefetched by the page) in
 * `DocumentReader`, or an empty state while Dirección has added none.
 */
export function EmpresaDocument({ slug, parte }: EmpresaDocumentProps) {
  const { data } = useQuery(bibliotecaLinksOptions("empresa"));
  const doc = empresaDoc(slug);
  if (!doc) return null;
  const parts = empresaDocLinks(data?.links ?? NO_LINKS, doc.slug);
  const current = pickDocumentPart(parts, parte);

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          estilo={false}
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
    />
  );
}
