"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";

import DrivePickerDialog, { type DrivePickerEntry } from "@/components/recursos/DrivePickerDialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import type { BibliotecaLayoutProps } from "@/components/widgets/biblioteca/types";
import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { GroupedTable, type GroupAnchor } from "@/components/widgets/GroupedTable";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import { createResourceLinkAction, recordResourceOpenAction } from "@/lib/actions/resources-actions";
import type { ResourcesCapabilities } from "@/lib/auth/permissions";
import {
  BIBLIOTECA_TABLE_SECTIONS,
  appliesToLabel,
  bibliotecaIndexSearch,
  bibliotecaRecentRows,
  buildBibliotecaTable,
  formatDocumentSize,
  parseBibliotecaIndexFilters,
  shortDate,
  type BibliotecaGroupTarget,
  type BibliotecaIndexFilters,
  type BibliotecaMostrar,
  type BibliotecaRow,
  type BibliotecaTipo,
} from "@/lib/biblioteca/catalog";
import type { BibliotecaData } from "@/lib/biblioteca/load";
import { getDriveId } from "@/lib/google/drive-url";
import { mutationErrorText, useActionMutation } from "@/lib/query/mutation";
import { BIBLIOTECA_LINKS_PREFIX, bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { useRecentDocs } from "@/lib/stores/recent-docs-store";
import { tramoColorVar } from "@/lib/tramos/tramo-color";
import type { ResourceAppliesTo, ResourceLink, ResourceLinkInput } from "@/lib/types/resource";

/**
 * Biblioteca · Analítico (frame `Biblioteca-Analitico`, issue #1006): every
 * document in one grouped table, section → project (La empresa → company
 * document), under one filter card and a KPI strip, then the grand total and
 * the viewer's "Abiertos recientemente". Filters (`?mostrar=`, `?clase=`,
 * `?favoritos=1`) and the expanded sections (`?abiertos=`) live in the URL
 * (replace, no new history entry); the search is the index's `?q=`. Each
 * expanded project group ends with a quick-add line that files a link (a
 * pasted URL) or opens the Drive picker with the typed name, only where the
 * viewer may create. Open counts come from `biblioteca.links(null).usage`;
 * without them every opens column and figure is left out. Who opened a
 * document is never shown.
 */
export const ANALITICO_NO_MATCH = "Ningún documento coincide con los filtros.";
export const ANALITICO_CLEAR_FILTERS = "Quitar filtros";
export const ANALITICO_SEARCH_LABEL = "Buscar documentos";
export const ANALITICO_QUICK_ADD_PLACEHOLDER = "Escribe un nombre o pega un enlace para agregar… o suelta un archivo";
export const RECENTS_ANCHOR_ID = "s-recientes";

/** How long a created row keeps its `row-new` flash. */
const ROW_NEW_MS = 1600;

const URL_PATTERN = /https?:\/\/\S+/i;

/** Writes the URL search without a new history entry (the App Router mirrors it into `useSearchParams`). */
function replaceSearch(search: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

function currentSearch(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

/** Whether the viewer may add documents to a group: Empresa with `enterprise.canCreate`, own Mis documentos always, the rest with `corporate.canCreate`. */
export function canQuickAdd(target: Pick<BibliotecaGroupTarget, "section">, capabilities: ResourcesCapabilities | null): boolean {
  if (!capabilities) return false;
  if (target.section === "empresa") return capabilities.enterprise.canCreate;
  if (target.section === "mis-documentos") return true;
  return capabilities.corporate.canCreate;
}

/** A title for a pasted link: the text before the URL, else the URL's last path part, else its host. */
export function titleFromLinkText(text: string): string {
  const match = text.match(URL_PATTERN);
  if (!match) return text.trim();
  const before = text.slice(0, match.index).trim().replace(/[\s:·–—-]+$/, "");
  if (before) return before;
  try {
    const url = new URL(match[0]);
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last && !/^(edit|view|preview)$/i.test(last) && !getDriveId(match[0])) return decodeURIComponent(last);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return match[0];
  }
}

/** The create input of a quick-add line: a pasted URL (Drive file or web) or a picked Drive entry. */
export function quickAddInput(
  target: BibliotecaGroupTarget,
  source: { kind: "url"; text: string } | { kind: "drive"; title: string; entry: DrivePickerEntry },
  viewerId: string | null,
): ResourceLinkInput {
  const base = {
    section: target.section,
    templateKey: target.templateKey,
    projectId: target.projectId,
    ownerId: viewerId,
    personalForId: target.section === "mis-documentos" ? viewerId : null,
  };
  if (source.kind === "url") {
    const url = source.text.match(URL_PATTERN)?.[0] ?? source.text.trim();
    return { ...base, title: titleFromLinkText(source.text), url, linkType: getDriveId(url) ? "drive_file" : "web", drive: null };
  }
  const { entry } = source;
  return {
    ...base,
    title: source.title.trim() || entry.name,
    url: entry.webViewLink,
    linkType: entry.isFolder ? "drive_folder" : "drive_file",
    drive: {
      googleFileId: entry.id,
      fileName: entry.name,
      mimeType: entry.mimeType,
      iconLink: entry.iconLink,
      thumbnailLink: entry.thumbnailLink,
      webViewLink: entry.webViewLink,
      sizeBytes: entry.sizeBytes ?? null,
      syncedAt: new Date().toISOString(),
    },
  };
}

function addCreated(client: QueryClient, created: ResourceLink): void {
  client.setQueryData<BibliotecaData>(bibliotecaLinksOptions(null).queryKey, (old) =>
    old && !old.links.some((link) => link.id === created.id) ? { ...old, links: [...old.links, created] } : old,
  );
}

const TRAMO_DOTS: Record<ResourceAppliesTo, string[]> = {
  general: ["var(--muted-foreground)"],
  diseno: [tramoColorVar({ key: "diseno", sortOrder: 0 })],
  construccion: [tramoColorVar({ key: "construccion", sortOrder: 0 })],
  ambos: [tramoColorVar({ key: "diseno", sortOrder: 0 }), tramoColorVar({ key: "construccion", sortOrder: 0 })],
};

function TramoCell({ value }: { value: ResourceAppliesTo }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {TRAMO_DOTS[value].map((color) => (
        <span key={color} aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ))}
      {appliesToLabel(value)}
    </span>
  );
}

type QuickAddLineProps = {
  target: BibliotecaGroupTarget;
  colSpan: number;
  /** Creates from a pasted URL; resolves to the error text, or null. */
  onLink(text: string): Promise<string | null>;
  /** Opens the Drive picker with the typed name. */
  onBrowse(name: string): void;
};

/** The quick-add line of a project group (`QuickAddRow variant="row"` look, for documents). */
function DocumentQuickAddRow({ target, colSpan, onLink, onBrowse }: QuickAddLineProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setError(null);
    if (!URL_PATTERN.test(trimmed)) {
      onBrowse(trimmed);
      setText("");
      return;
    }
    setBusy(true);
    const failure = await onLink(trimmed);
    setBusy(false);
    if (failure) setError(failure);
    else setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void submit(text);
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      setText("");
    }
  };

  const onDrop = (event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    const dropped = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (dropped.trim()) {
      setText(dropped.trim());
      return;
    }
    const file = event.dataTransfer.files?.[0];
    // No upload path: a dropped file is looked up in Drive by its name.
    if (file) onBrowse(file.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <tr data-slot="quick-add" data-variant="row">
      <td
        colSpan={colSpan}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="border-b border-border p-0 focus-within:bg-muted/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset"
      >
        <div className="flex items-center gap-2 px-3 py-1.5 pl-10">
          <Plus aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <label htmlFor={id} className="sr-only">
            Agregar documento en {target.label}
          </label>
          <input
            id={id}
            type="text"
            value={text}
            disabled={busy}
            aria-busy={busy || undefined}
            placeholder={ANALITICO_QUICK_ADD_PLACEHOLDER}
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        {error ? (
          <div className="px-3 pb-2 pl-10">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function MoreRow({ target, colSpan }: { target: BibliotecaGroupTarget; colSpan: number }) {
  return (
    <tr data-slot="group-more">
      <td colSpan={colSpan} className="border-b border-border px-3 py-[7px] pl-10 text-[12.5px] text-muted-foreground">
        <Link href={target.moreHref} className="underline-offset-[3px] hover:underline">
          {target.moreCount} {target.moreCount === 1 ? "documento más" : "documentos más"} en {target.label} →
        </Link>
      </td>
    </tr>
  );
}

function LoadingLayout() {
  return (
    <div className="flex flex-col gap-[18px]" aria-busy="true">
      <KpiStrip items={[]} loading />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-[52px] w-full rounded-[14px]" />
      ))}
    </div>
  );
}

function RecentsCard({ rows, withOpens }: { rows: ReturnType<typeof bibliotecaRecentRows>; withOpens: boolean }) {
  const headingId = useId();
  const th = "border-b bg-muted px-3 py-2 text-left font-mono text-[11px] font-medium tracking-[.08em] whitespace-nowrap text-muted-foreground uppercase";
  const td = "border-b border-border px-3 py-[7px] whitespace-nowrap";
  return (
    <section
      id={RECENTS_ANCHOR_ID}
      aria-labelledby={headingId}
      className="scroll-mt-4 overflow-hidden rounded-[14px] border bg-card shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-baseline gap-3 px-4 py-3">
        <h2 id={headingId} className="text-[15px] font-semibold text-foreground">
          Abiertos recientemente
        </h2>
        <span className="font-mono text-[12.5px] text-muted-foreground">tus últimos 5</span>
      </div>
      {rows.length === 0 ? (
        <p className="border-t px-4 py-3 text-[12.5px] text-muted-foreground">Aún no has abierto documentos.</p>
      ) : (
        <div className="overflow-x-auto border-t">
          <table aria-labelledby={headingId} className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th scope="col" className={`${th} pl-4`}>
                  Documento
                </th>
                <th scope="col" className={th}>
                  Sección
                </th>
                <th scope="col" className={th}>
                  Proyecto
                </th>
                <th scope="col" className={th}>
                  Abierto
                </th>
                {withOpens ? (
                  <th scope="col" className={`${th} text-right`}>
                    Veces 30 d
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${td} max-w-[420px] truncate pl-4`} title={row.documento}>
                    <Link href={row.href} className="text-foreground underline decoration-border underline-offset-[3px]">
                      {row.documento}
                    </Link>
                  </td>
                  <td className={td}>{row.seccion}</td>
                  <td className={td}>{row.proyecto}</td>
                  <td className={`${td} font-mono tabular-nums`}>{row.abierto}</td>
                  {withOpens ? <td className={`${td} text-right font-mono tabular-nums`}>{row.veces30d ?? 0}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BibliotecaAnalitico(props: BibliotecaLayoutProps): ReactNode {
  const { links, capabilities, showEmpresa, showRecursos, query, onQueryChange, recents, isPending, now } = props;
  // `usage` and the viewer come with the same `biblioteca.links(null)` the index read (a cache hit).
  const { data } = useQuery(bibliotecaLinksOptions(null));
  const usage = data?.usage ?? null;
  const viewerId = data?.viewerId ?? null;
  const remember = useRecentDocs((state) => state.remember);

  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Omit<BibliotecaIndexFilters, "q" | "abiertos">>(() => {
    const parsed = parseBibliotecaIndexFilters(new URLSearchParams(searchParams?.toString() ?? ""));
    return { mostrar: parsed.mostrar, clase: parsed.clase, favoritos: parsed.favoritos };
  });
  // Null = the default (first section with documents); [] = everything closed.
  const [abiertos, setAbiertos] = useState<string[] | null>(() =>
    searchParams?.has("abiertos") ? parseBibliotecaIndexFilters(new URLSearchParams(searchParams.toString())).abiertos : null,
  );
  const [collapsedChildren, setCollapsedChildren] = useState<ReadonlySet<string>>(() => new Set());
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set());
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(() => new Set());
  const [picker, setPicker] = useState<{ target: BibliotecaGroupTarget; name: string } | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const flashTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const table = useMemo(
    () => buildBibliotecaTable(links, { ...filters, q: query, abiertos: [] }, { showEmpresa, showRecursos, now, usage, newIds }),
    [links, filters, query, showEmpresa, showRecursos, now, usage, newIds],
  );
  const recentRows = useMemo(() => bibliotecaRecentRows(recents, links, { now, usage }), [recents, links, now, usage]);
  const byId = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);

  const create = useActionMutation<ResourceLinkInput, ResourceLink>(createResourceLinkAction, {
    invalidate: [BIBLIOTECA_LINKS_PREFIX],
    successToast: "Documento agregado",
    setData: (client, created) => addCreated(client, created),
    // The quick-add line shows the error inline (and keeps its text) instead of a toast.
    onFormError: () => undefined,
  });

  const markNew = (id: string) => {
    setNewIds((current) => new Set(current).add(id));
    setFlashIds((current) => new Set(current).add(id));
    flashTimers.current.push(
      setTimeout(() => {
        setFlashIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, ROW_NEW_MS),
    );
  };

  const createFrom = async (input: ResourceLinkInput): Promise<string | null> => {
    try {
      const created = await create.mutateAsync(input);
      markNew(created.id);
      return null;
    } catch (error) {
      return mutationErrorText(error) || "No se pudo agregar el documento.";
    }
  };

  // ── Expansion (URL `?abiertos=` for sections, local state for project groups) ──
  const topIds = table.groups.map((group) => group.id);
  const openTop = abiertos ?? table.nonEmpty.slice(0, 1);
  const childIds = (topId: string) => table.groups.find((group) => group.id === topId)?.children?.map((child) => child.id) ?? [];
  const expanded = openTop.flatMap((id) => [id, ...childIds(id).filter((child) => !collapsedChildren.has(child))]);

  const onExpandedChange = (ids: string[]) => {
    const open = new Set(ids);
    const nextTop = topIds.filter((id) => open.has(id));
    const wasOpen = new Set(openTop);
    const collapsed = new Set(collapsedChildren);
    for (const id of nextTop) {
      const children = childIds(id);
      // A section that just opened shows its project groups open (unless the change names some of them).
      const fresh = !wasOpen.has(id) && !children.some((child) => open.has(child));
      for (const child of children) {
        if (fresh || open.has(child)) collapsed.delete(child);
        else collapsed.add(child);
      }
    }
    setCollapsedChildren(collapsed);
    setAbiertos(nextTop);
    replaceSearch(bibliotecaIndexSearch(currentSearch(), { abiertos: nextTop }));
  };

  // ── Filters ──
  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    replaceSearch(bibliotecaIndexSearch(currentSearch(), patch));
  };

  const clearFilters = () => {
    setFilter({ mostrar: "todos", clase: "todos", favoritos: false });
    if (query) onQueryChange("");
  };

  const filtered = filters.mostrar !== "todos" || filters.clase !== "todos" || filters.favoritos || query.trim().length > 0;

  const count = (key: string) => table.counts[key] ?? 0;
  const filterGroups: FilterGroup[] = [
    {
      id: "mostrar",
      label: "Mostrar",
      value: filters.mostrar,
      options: [
        { value: "todos", label: "Todos", count: count("mostrar:todos") },
        { value: "actualizados", label: "Actualizados 30 d", count: count("mostrar:actualizados") },
        { value: "sin-actualizar", label: "Sin actualizar", count: count("mostrar:sin-actualizar"), color: "var(--warning)" },
      ],
    },
    {
      id: "clase",
      label: "Tipo",
      value: filters.clase,
      options: [
        { value: "todos", label: "Todos" },
        { value: "pdf", label: "PDF" },
        { value: "plantilla", label: "Plantilla" },
        { value: "hoja", label: "Hoja" },
        { value: "video", label: "Video" },
      ],
    },
    {
      id: "favoritos",
      label: "Favoritos",
      value: filters.favoritos ? "1" : "0",
      options: [
        { value: "0", label: "Todos" },
        { value: "1", label: "Mis favoritos", count: count("favoritos:1") },
      ],
    },
  ];

  const onFilterChange = (groupId: string, value: string) => {
    if (groupId === "mostrar") setFilter({ mostrar: value as BibliotecaMostrar });
    else if (groupId === "clase") setFilter({ clase: value as BibliotecaTipo });
    else if (groupId === "favoritos") setFilter({ favoritos: value === "1" });
  };

  const kpis: KpiStripItem[] = [
    { key: "documentos", label: "Documentos", value: table.kpis.documentos },
    { key: "secciones", label: "Secciones", value: table.kpis.secciones },
    { key: "actualizados", label: "Actualizados 30 d", value: table.kpis.actualizados30 },
    { key: "sin-actualizar", label: "Sin actualizar +180 d", value: table.kpis.sinActualizar },
    ...(table.kpis.abiertosSemana !== null ? [{ key: "abiertos", label: "Abiertos esta semana", value: table.kpis.abiertosSemana }] : []),
  ];

  // ── Rows ──
  const maxOpens = useMemo(() => {
    const max = new Map<string, number>();
    for (const group of table.groups) {
      for (const child of group.children ?? []) {
        const top = Math.max(0, ...(child.rows ?? []).map((row) => row.opens30d ?? 0));
        for (const row of child.rows ?? []) max.set(`${child.id}\u0000${row.id}`, top);
      }
    }
    return max;
  }, [table]);
  const rowGroup = useMemo(() => {
    const owner = new Map<BibliotecaRow, string>();
    for (const group of table.groups) for (const child of group.children ?? []) for (const row of child.rows ?? []) owner.set(row, child.id);
    return owner;
  }, [table]);

  const openDocument = (row: BibliotecaRow) => {
    const link = byId.get(row.id);
    if (link) remember(link);
    void recordResourceOpenAction({ linkId: row.id }).catch(() => undefined);
  };

  const renderCell = (key: string, row: BibliotecaRow): ReactNode | undefined => {
    switch (key) {
      case "nombre": {
        const suffix = row.isNew ? <span className="ml-1 text-[11.5px] font-normal text-secondary-foreground"> · nuevo</span> : null;
        const name = row.href.startsWith("/") ? (
          <Link href={row.href} title={row.nombre} className="text-foreground underline decoration-border underline-offset-[3px]">
            {row.nombre}
          </Link>
        ) : (
          <a
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            title={row.nombre}
            onClick={() => openDocument(row)}
            className="text-foreground underline decoration-border underline-offset-[3px]"
          >
            {row.nombre}
          </a>
        );
        return (
          <span className="inline-block max-w-[420px] truncate align-bottom">
            {name}
            {suffix}
          </span>
        );
      }
      case "tramo":
        return <TramoCell value={row.tramo} />;
      case "responsable":
        return row.responsable ?? "—";
      case "actualizado": {
        const label = row.isNew ? "hoy" : shortDate(row.actualizado) || "—";
        return row.stale ? (
          <span data-stale="true" className="rounded-sm bg-tint-warning px-1.5 py-0.5 text-warning-ink">
            {label}
          </span>
        ) : (
          label
        );
      }
      case "sizeBytes":
        return formatDocumentSize(row.sizeBytes);
      case "opens30d": {
        if (row.opens30d === null) return "—";
        const group = rowGroup.get(row);
        const top = group ? (maxOpens.get(`${group}\u0000${row.id}`) ?? 0) : 0;
        return row.opens30d > 0 && row.opens30d === top ? <b className="font-semibold">{row.opens30d}</b> : row.opens30d;
      }
      default:
        return undefined;
    }
  };

  // ── Groups with their "más en" link and quick-add line ──
  const colSpan = table.columns.length;
  const groups = table.groups.map((group) => ({
    ...group,
    children: group.children?.map((child) => {
      const target = table.targets[child.id];
      if (!target) return child;
      const writable = canQuickAdd(target, capabilities);
      if (target.moreCount === 0 && !writable) return child;
      return {
        ...child,
        quickAdd: (
          <>
            {target.moreCount > 0 ? <MoreRow target={target} colSpan={colSpan} /> : null}
            {writable ? (
              <DocumentQuickAddRow
                target={target}
                colSpan={colSpan}
                onLink={(text) => createFrom(quickAddInput(target, { kind: "url", text }, viewerId))}
                onBrowse={(name) => {
                  setPickerError(null);
                  setPicker({ target, name });
                }}
              />
            ) : null}
          </>
        ),
      };
    }),
  }));

  const anchors: GroupAnchor[] = BIBLIOTECA_TABLE_SECTIONS.filter((section) => topIds.includes(section.id)).map((section) => ({
    groupId: section.id,
    label: section.title,
    count: table.sectionCounts[section.id] ?? 0,
  }));

  const opensSummary = table.totals.opens30d !== null ? `${table.totals.opens30d} aperturas en 30 d · ` : "";

  if (isPending) return <LoadingLayout />;

  return (
    <div className="flex min-w-0 flex-col gap-[18px]">
      <FilterCard
        groups={filterGroups}
        onChange={onFilterChange}
        search={{ value: query, onChange: onQueryChange, placeholder: ANALITICO_SEARCH_LABEL, label: ANALITICO_SEARCH_LABEL }}
      />

      <KpiStrip items={kpis} />

      {filtered && table.kpis.documentos === 0 ? (
        <div className="rounded-[14px] border bg-card shadow-[var(--shadow-card)]">
          <EmptyState title={ANALITICO_NO_MATCH} action={{ label: ANALITICO_CLEAR_FILTERS, onClick: clearFilters }} />
        </div>
      ) : (
        <GroupedTable<BibliotecaRow>
          label="Documentos de la biblioteca"
          columns={table.columns}
          groups={groups}
          anchors={anchors}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
          getRowId={(row) => row.id}
          renderCell={renderCell}
          isRowNew={(row) => flashIds.has(row.id)}
          totals={{
            label: `Total · ${table.totals.documentos} ${table.totals.documentos === 1 ? "documento" : "documentos"} en ${table.totals.secciones} ${table.totals.secciones === 1 ? "sección" : "secciones"}`,
            summary: `${opensSummary}${table.totals.sinActualizar} sin actualizar`,
          }}
        />
      )}

      {pickerError ? (
        <Alert variant="destructive">
          <AlertDescription>{pickerError}</AlertDescription>
        </Alert>
      ) : null}

      <RecentsCard rows={recentRows} withOpens={usage !== null} />

      <DrivePickerDialog
        open={picker !== null}
        initialQuery={picker?.name}
        onClose={() => setPicker(null)}
        onPick={(entry) => {
          const current = picker;
          setPicker(null);
          if (!current) return;
          void createFrom(quickAddInput(current.target, { kind: "drive", title: current.name, entry }, viewerId)).then(setPickerError);
        }}
      />
    </div>
  );
}
