"use client";

import {
  BookMarked,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Folder,
  GraduationCap,
  Landmark,
  Palette,
  PencilRuler,
  ScrollText,
  Search,
  Star,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, type ReactNode } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  BIBLIOTECA_RECURSOS,
  BIBLIOTECA_SECTION_COLOR,
  buildBibliotecaOverview,
  empresaDocLinks,
  matchesSearch,
  nextVacation,
  recentDocumentHref,
  recurso,
  relativeOpened,
  shortDate,
  type BibliotecaCardKey,
  type ChartSlot,
} from "@/lib/biblioteca/catalog";
import type { ResourceSection } from "@/lib/types/resource";

import type { BibliotecaLayoutProps } from "./types";

const RECENT_COUNT = 4;

/** Frame order of the Recursos block. */
const RECURSOS_ORDER: BibliotecaCardKey[] = [
  "formatos-obra",
  "plantillas-diseno",
  "formacion",
  "mis-documentos",
  "mis-favoritos",
  "mis-vacaciones",
];

const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  "book-marked": BookMarked,
  palette: Palette,
  landmark: Landmark,
  "scroll-text": ScrollText,
  "graduation-cap": GraduationCap,
  "clipboard-list": ClipboardList,
  "pencil-ruler": PencilRuler,
  folder: Folder,
  star: Star,
  "calendar-days": CalendarDays,
};

/** Section tint behind the icon and its ink (tokens from the tint set; neutral = muted / foreground). */
const SLOT_TILE: Record<ChartSlot, string> = {
  1: "bg-tint-primary text-(--chart-1-ink)",
  2: "bg-tint-violet text-(--chart-2-ink)",
  3: "bg-tint-warning text-(--chart-3-ink)",
  4: "bg-tint-cyan text-(--chart-4-ink)",
  5: "bg-tint-success text-(--chart-5-ink)",
};

function tileClass(slot: ChartSlot | null): string {
  return slot ? SLOT_TILE[slot] : "bg-muted text-foreground";
}

const CARD =
  "anim-in flex rounded-[14px] border border-border bg-card text-card-foreground shadow-(--shadow-card) outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function documentosLabel(count: number): string {
  return `${count} ${count === 1 ? "documento" : "documentos"}`;
}

function sectionName(section: ResourceSection): string {
  return section === "empresa" ? "La empresa" : (recurso(section)?.title ?? section);
}

function isInternal(href: string): boolean {
  return href.startsWith("/");
}

/** One card = one link; internal routes through `next/link`, Drive URLs in a new tab. */
function CardLink({ href, title, className, children }: { href: string; title: string; className: string; children: ReactNode }) {
  if (isInternal(href)) {
    return (
      <Link href={href} title={title} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function IconTile({ iconName, tone, size }: { iconName: string; tone: string; size: "sm" | "md" }) {
  const Icon = ICONS[iconName] ?? FileText;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] ${size === "sm" ? "size-8" : "size-9"} ${tone}`}
    >
      <Icon className={size === "sm" ? "size-4" : "size-[18px]"} aria-hidden="true" />
    </span>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-[15px] font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

const RECENT_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";
const EMPRESA_GRID = "grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
const RECURSOS_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

function SkeletonGrid({ grid, count, height, label }: { grid: string; count: number; height: string; label: string }) {
  return (
    <ul role="list" aria-label={label} aria-busy="true" className={grid}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <Skeleton className={`${height} w-full rounded-[14px]`} />
        </li>
      ))}
    </ul>
  );
}

function LoadingLayout({ ids, showEmpresa }: { ids: { recents: string; empresa: string; recursos: string }; showEmpresa: boolean }) {
  return (
    <div data-style="esencial" className="flex flex-col gap-6">
      <Block id={ids.recents} title="Abiertos recientemente">
        <SkeletonGrid grid={RECENT_GRID} count={4} height="h-[84px]" label="Cargando documentos recientes" />
      </Block>
      {showEmpresa ? (
        <Block id={ids.empresa} title="La empresa">
          <SkeletonGrid grid={EMPRESA_GRID} count={5} height="h-[104px]" label="Cargando documentos de la empresa" />
        </Block>
      ) : null}
      <Block id={ids.recursos} title="Recursos">
        <SkeletonGrid grid={RECURSOS_GRID} count={6} height="h-[72px]" label="Cargando recursos" />
      </Block>
    </div>
  );
}

type RecursoItem = {
  key: BibliotecaCardKey;
  title: string;
  iconName: string;
  href: string;
  meta: ReactNode;
  /** Plain text of `meta`, for the `title` attribute. */
  metaText: string;
};

/**
 * Biblioteca · Esencial (frame `Biblioteca-Esencial`, issue #1005): three
 * blocks of soft cards, one number per item, no previews, charts or tables.
 * "Abiertos recientemente" (the first 4 of `useRecentDocs`), "La empresa"
 * (one card per company document, only with `enterprise.canView`) and
 * "Recursos" (one row card per section plus Mis vacaciones). Counts come from
 * `buildBibliotecaOverview`, so they equal the Visual ones for the same data;
 * section colors follow `BIBLIOTECA_SECTION_COLOR` in every style.
 *
 * Renders what `BibliotecaIndex` hands it (`BibliotecaLayoutProps`): the
 * index owns the queries (`biblioteca.links(null)`, `me.vacations()`), the
 * `?q=` search, the recents store and the error boundary.
 */
export function BibliotecaEsencial({
  links,
  showEmpresa,
  showRecursos,
  query: rawQuery,
  recents: recentStored,
  vacations,
  isPending,
  now,
  today,
}: BibliotecaLayoutProps): ReactNode {
  const query = rawQuery.trim();
  const baseId = useId();
  const ids = { recents: `${baseId}-recientes`, empresa: `${baseId}-empresa`, recursos: `${baseId}-recursos` };

  const overview = useMemo(
    () => buildBibliotecaOverview(links, { showEmpresa, showRecursos, now }),
    [links, showEmpresa, showRecursos, now],
  );

  const recents = useMemo(
    () =>
      recentStored
        .filter((doc) => matchesSearch(query, doc.title, sectionName(doc.section)))
        .slice(0, RECENT_COUNT)
        .map((doc) => ({
          id: doc.id,
          title: doc.title,
          section: sectionName(doc.section),
          opened: relativeOpened(doc.openedAt, now),
          href: recentDocumentHref(links, doc),
        })),
    [recentStored, query, links, now],
  );

  const empresa = useMemo(() => {
    if (!overview.empresa) return null;
    return overview.empresa.filter((doc) =>
      matchesSearch(query, doc.title, ...empresaDocLinks(links, doc.slug).map((link) => link.title)),
    );
  }, [overview.empresa, links, query]);

  const vacation = useMemo(() => nextVacation(vacations, today), [vacations, today]);

  const recursos = useMemo((): RecursoItem[] => {
    const stat = (key: BibliotecaCardKey) => overview.sections.find((section) => section.key === key) ?? null;
    return BIBLIOTECA_RECURSOS.flatMap((item): RecursoItem[] => {
      if (item.section === "mis-vacaciones") {
        if (!matchesSearch(query, item.title)) return [];
        const available = vacation?.available ?? null;
        const days = available === null ? "" : `${available} ${available === 1 ? "día" : "días"}`;
        const metaText = available === null ? "Ver saldo y solicitudes" : `${days} disponibles`;
        const meta: ReactNode =
          available === null ? (
            metaText
          ) : (
            <>
              <span className="font-mono font-semibold tabular-nums text-(--chart-4-ink)">{days}</span> disponibles
            </>
          );
        return [{ key: "mis-vacaciones", title: item.title, iconName: item.iconName, href: item.href, meta, metaText }];
      }
      if (!showRecursos) return [];
      const sectionLinks = links.filter((link) => link.section === item.section);
      if (!matchesSearch(query, item.title, ...sectionLinks.map((link) => link.title))) return [];
      const count = item.section === "mis-favoritos" ? overview.favoritesCount : (stat(item.section)?.count ?? sectionLinks.length);
      const updatedAt = stat(item.section)?.updatedAt ?? null;
      const withDate = item.section === "formatos-obra" || item.section === "plantillas-diseno" || item.section === "formacion";
      const date = withDate && count > 0 && updatedAt ? shortDate(updatedAt) : "";
      const metaText = date ? `${documentosLabel(count)} · act. ${date}` : documentosLabel(count);
      return [
        {
          key: item.section,
          title: item.title,
          iconName: item.iconName,
          href: item.href,
          meta: <span className="font-mono tabular-nums">{metaText}</span>,
          metaText,
        },
      ];
    }).sort((a, b) => RECURSOS_ORDER.indexOf(a.key) - RECURSOS_ORDER.indexOf(b.key));
  }, [overview, links, query, showRecursos, vacation]);

  if (isPending) return <LoadingLayout ids={ids} showEmpresa={showEmpresa} />;

  const searching = query.length > 0;
  const showRecents = !searching || recents.length > 0;
  const showEmpresaBlock = empresa !== null && (!searching || empresa.length > 0);
  const hasRecursos = recursos.length > 0;

  if (searching && !showRecents && !showEmpresaBlock && !hasRecursos) {
    return (
      <div data-style="esencial">
        <EmptyState icon={Search} title="Sin resultados" description={`Nada en la biblioteca coincide con “${query}”.`} />
      </div>
    );
  }

  return (
    <div data-style="esencial" className="flex min-w-0 flex-col gap-6">
      {showRecents ? (
        <Block id={ids.recents} title="Abiertos recientemente">
          {recents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no has abierto documentos.</p>
          ) : (
            <ul role="list" className={RECENT_GRID}>
              {recents.map((doc) => (
                <li key={doc.id} className="min-w-0">
                  <CardLink
                    href={doc.href}
                    title={doc.title}
                    className={`${CARD} h-full min-w-0 flex-col gap-1 px-4 py-3.5`}
                  >
                    <span className="truncate text-[13.5px] font-semibold text-foreground">{doc.title}</span>
                    <span className="truncate text-[12.5px] text-muted-foreground">{doc.section}</span>
                    <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{doc.opened}</span>
                  </CardLink>
                </li>
              ))}
            </ul>
          )}
        </Block>
      ) : null}

      {showEmpresaBlock && empresa ? (
        <Block id={ids.empresa} title="La empresa">
          <ul role="list" className={EMPRESA_GRID}>
            {empresa.map((doc) => (
              <li key={doc.slug} className="min-w-0">
                <CardLink
                  href={doc.href}
                  title={doc.title}
                  className={`${CARD} h-full min-w-0 flex-col items-start gap-2.5 p-4`}
                >
                  <IconTile iconName={doc.iconName} tone="bg-secondary text-secondary-foreground" size="sm" />
                  <span className="line-clamp-2 text-sm font-semibold text-foreground">{doc.title}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{documentosLabel(doc.count)}</span>
                    {doc.isNew ? <span className="text-secondary-foreground"> · nuevo</span> : null}
                  </span>
                </CardLink>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {hasRecursos ? (
        <Block id={ids.recursos} title="Recursos">
          <ul role="list" className={RECURSOS_GRID}>
            {recursos.map((item) => (
              <li key={item.key} className="min-w-0">
                <CardLink
                  href={item.href}
                  title={`${item.title} · ${item.metaText}`}
                  className={`${CARD} h-full min-w-0 items-center gap-3.5 p-[18px]`}
                >
                  <IconTile iconName={item.iconName} tone={tileClass(BIBLIOTECA_SECTION_COLOR[item.key])} size="md" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="text-[12.5px] text-muted-foreground">{item.meta}</span>
                  </span>
                </CardLink>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}
