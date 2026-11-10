"use client";

import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { currentMonth, todayIso } from "@/components/biblioteca/vacation-format";
import { BibliotecaUploadSheet, canAddBibliotecaDocuments } from "@/components/biblioteca/BibliotecaUploadSheet";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { BibliotecaAnalitico } from "@/components/widgets/biblioteca/BibliotecaAnalitico";
import { BibliotecaEsencial } from "@/components/widgets/biblioteca/BibliotecaEsencial";
import { BibliotecaVisual } from "@/components/widgets/biblioteca/BibliotecaVisual";
import type { BibliotecaLayoutProps } from "@/components/widgets/biblioteca/types";
import { PageHeader } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { bibliotecaLinksOptions, myVacationsOptions } from "@/lib/query/options/biblioteca";
import { useRecentDocs } from "@/lib/stores/recent-docs-store";
import type { ResourceLink } from "@/lib/types/resource";

const NO_LINKS: ResourceLink[] = [];

/** How long typing waits before the search reaches the URL (`?q=`). */
export const BIBLIOTECA_SEARCH_DEBOUNCE_MS = 200;

export const BIBLIOTECA_TITLE = "Biblioteca";
export const BIBLIOTECA_DESCRIPTION = "Documentos de la empresa, formatos y tus archivos.";
export const BIBLIOTECA_ANALITICO_DESCRIPTION = "Por sección y proyecto, con uso y antigüedad de cada documento.";
export const BIBLIOTECA_SEARCH_LABEL = "Buscar documentos";

/**
 * Writes the search to the URL with `history.replaceState` (no new history
 * entry, no server render): the App Router mirrors it into
 * `useSearchParams`, and the other parameters of the URL stay.
 */
function replaceQuery(value: string): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const q = value.trim();
  if (q) params.set("q", q);
  else params.delete("q");
  const search = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

/**
 * `/biblioteca` index (frames `Biblioteca-Visual`, `Biblioteca-Esencial`,
 * `Biblioteca-Analitico`): owns the data and the shared state and hands them
 * to the style's layout through `PageStyleLayout`. Reads
 * `biblioteca.links(null)` and `me.vacations` (both prefetched by the page)
 * and `useRecentDocs`; keeps the search in `?q=` (debounced 200 ms, replace);
 * "Subir documento" opens the resource add flow in a sheet. Visual and
 * Esencial search in the header; Analítico moves the search into its filter
 * card.
 */
export function BibliotecaIndex() {
  const { data, error, isPending } = useQuery(bibliotecaLinksOptions(null));
  const [now] = useState(() => new Date());
  const { data: vacations } = useQuery(myVacationsOptions(currentMonth(now)));
  const recents = useRecentDocs((state) => state.docs);

  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams?.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (error && !data) throw error;

  const changeQuery = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => replaceQuery(value), BIBLIOTECA_SEARCH_DEBOUNCE_MS);
  };

  const capabilities = data?.capabilities ?? null;
  const canUpload = canAddBibliotecaDocuments(capabilities);
  const driveEnabled = data?.driveEnabled ?? false;

  const props: BibliotecaLayoutProps = {
    links: data?.links ?? NO_LINKS,
    capabilities,
    showEmpresa: capabilities?.enterprise.canView ?? false,
    showRecursos: capabilities?.canViewResources ?? false,
    query,
    onQueryChange: changeQuery,
    recents,
    vacations: vacations ?? null,
    isPending: isPending && !data,
    driveEnabled,
    onUpload: canUpload ? () => setUploadOpen(true) : undefined,
    now,
    today: todayIso(now),
  };

  const uploadButton = canUpload ? (
    <Button type="button" onClick={() => setUploadOpen(true)}>
      <Upload className="size-4" aria-hidden="true" />
      Subir documento
    </Button>
  ) : null;

  const searchInput = (
    <Input
      type="search"
      value={query}
      onChange={(event) => changeQuery(event.target.value)}
      placeholder={BIBLIOTECA_SEARCH_LABEL}
      aria-label={BIBLIOTECA_SEARCH_LABEL}
      className="w-full sm:w-72"
    />
  );

  const header = (description: string, actions: ReactNode) => (
    <PageHeader title={BIBLIOTECA_TITLE} description={description} actions={actions} />
  );

  return (
    <div className="flex flex-col gap-2">
      <PageStyleLayout
        visual={() => (
          <>
            {header(BIBLIOTECA_DESCRIPTION, <>{searchInput}{uploadButton}</>)}
            <BibliotecaVisual {...props} />
          </>
        )}
        esencial={() => (
          <>
            {header(BIBLIOTECA_DESCRIPTION, <>{searchInput}{uploadButton}</>)}
            <BibliotecaEsencial {...props} />
          </>
        )}
        analitico={() => (
          <>
            {header(BIBLIOTECA_ANALITICO_DESCRIPTION, uploadButton)}
            <BibliotecaAnalitico {...props} />
          </>
        )}
      />
      {canUpload ? (
        <BibliotecaUploadSheet
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          capabilities={capabilities}
          viewerId={data?.viewerId ?? null}
          driveEnabled={driveEnabled}
        />
      ) : null}
    </div>
  );
}
