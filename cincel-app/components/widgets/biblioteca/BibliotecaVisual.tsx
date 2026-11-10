"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Shapes, Sparkles } from "lucide-react";
import { DynamicIcon } from "lucide-react/dynamic";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { DriveFilePreviewSheet, ResourcePreview } from "@/components/recursos/ResourcePreview";
import type { DriveBrowserEntry } from "@/components/recursos/DriveBrowser";
import { EmptyState } from "@/components/shell/EmptyState";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { resolveIconName } from "@/components/widgets/EntityCardGrid";
import type { BibliotecaLayoutProps } from "@/components/widgets/biblioteca/types";
import {
  BIBLIOTECA_SECTION_COLOR,
  buildBibliotecaOverview,
  documentBadge,
  featuredTemplates,
  manualRecentlyUpdated,
  matchesSearch,
  nextVacation,
  recentDocumentHref,
  recurso,
  relativeOpened,
  shortDate,
  templateUseHref,
  vacationRange,
  type BibliotecaOverview,
  type BibliotecaSectionStat,
  type ChartSlot,
  type DocumentBadge,
  type NextVacation,
} from "@/lib/biblioteca/catalog";
import { useRecentDocs, type RecentDocument } from "@/lib/stores/recent-docs-store";
import type { ResourceLink, ResourceSection } from "@/lib/types/resource";
import { staggerStyle } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

// ── Colors (tokens only) ────────────────────────────────────────────────────

type SlotClasses = { tile: string; dot: string; ink: string; stroke: string; stripe: string };

/** Section colors: tint fill + ink text for tiles, the chart color for dots and arcs. */
const SLOT: Record<ChartSlot, SlotClasses> = {
  1: { tile: "bg-tint-primary text-[color:var(--chart-1-ink)]", dot: "bg-chart-1", ink: "text-[color:var(--chart-1-ink)]", stroke: "stroke-chart-1", stripe: "var(--tint-primary)" },
  2: { tile: "bg-tint-violet text-[color:var(--chart-2-ink)]", dot: "bg-chart-2", ink: "text-[color:var(--chart-2-ink)]", stroke: "stroke-chart-2", stripe: "var(--tint-violet)" },
  3: { tile: "bg-tint-warning text-[color:var(--chart-3-ink)]", dot: "bg-chart-3", ink: "text-[color:var(--chart-3-ink)]", stroke: "stroke-chart-3", stripe: "var(--tint-warning)" },
  4: { tile: "bg-tint-cyan text-[color:var(--chart-4-ink)]", dot: "bg-chart-4", ink: "text-[color:var(--chart-4-ink)]", stroke: "stroke-chart-4", stripe: "var(--tint-cyan)" },
  5: { tile: "bg-tint-success text-[color:var(--chart-5-ink)]", dot: "bg-chart-5", ink: "text-[color:var(--chart-5-ink)]", stroke: "stroke-chart-5", stripe: "var(--tint-success)" },
};

const NEUTRAL: SlotClasses = {
  tile: "bg-muted text-foreground",
  dot: "bg-muted-foreground",
  ink: "text-muted-foreground",
  stroke: "stroke-muted-foreground",
  stripe: "var(--muted)",
};

function slot(color: ChartSlot | null): SlotClasses {
  return color === null ? NEUTRAL : SLOT[color];
}

const BADGE_CLASS: Partial<Record<DocumentBadge, string>> = {
  PDF: "bg-tint-destructive text-destructive-ink",
  DWG: "bg-tint-violet text-[color:var(--chart-2-ink)]",
  DOC: "bg-secondary text-secondary-foreground",
  XLSX: "bg-tint-success text-[color:var(--chart-5-ink)]",
};

function stripe(color: string, angle: number): CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(${angle}deg, ${color} 0 10px, color-mix(in oklab, ${color} 55%, var(--card)) 10px 20px)`,
  };
}

// ── Copy ────────────────────────────────────────────────────────────────────

/** Width of one carousel step: a 236 px card plus the 16 px gap. */
export const CAROUSEL_STEP = 252;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function sectionLabel(section: ResourceSection): string {
  return section === "empresa" ? "La empresa" : (recurso(section)?.title ?? section);
}

/** Plantillas is feminine ("3 nuevas"); every other section counts documents ("3 nuevos"). */
function newLabel(stat: BibliotecaSectionStat): string {
  return stat.key === "plantillas-diseno" ? plural(stat.newCount, "nueva", "nuevas") : plural(stat.newCount, "nuevo", "nuevos");
}

type FooterContext = { overview: BibliotecaOverview; manualUpdated: boolean; vacation: NextVacation | null };

/** The card footer line of a section. */
export function sectionFooter(stat: BibliotecaSectionStat, ctx: FooterContext): string {
  if (stat.key === "mis-vacaciones") {
    if (!ctx.vacation) return "Ver saldo y solicitudes";
    return ctx.vacation.next ? `Próximas: ${vacationRange(ctx.vacation.next.from, ctx.vacation.next.to)}` : "Sin vacaciones próximas";
  }
  if (stat.count === 0) return "Sin documentos";
  if (stat.key === "mis-documentos") return plural(ctx.overview.favoritesCount, "favorito", "favoritos");
  if (stat.key === "empresa") return ctx.manualUpdated ? "Manual actualizado" : `act. ${shortDate(stat.updatedAt)}`;
  const parts: string[] = [];
  if (stat.newCount > 0) parts.push(newLabel(stat));
  if (stat.updatedAt) parts.push(`act. ${shortDate(stat.updatedAt)}`);
  return parts.join(" · ");
}

function firstWord(title: string): string {
  return title.trim().split(/\s+/)[0] ?? "";
}

function isInternal(href: string): boolean {
  return href.startsWith("/");
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/** One card link: in-app routes through `next/link`, Drive and web links in a new tab. */
function CardLink({
  href,
  className,
  style,
  children,
  label,
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  label?: string;
}) {
  if (isInternal(href)) {
    return (
      <Link href={href} className={className} style={style} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style} aria-label={label}>
      {children}
    </a>
  );
}

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const CARD = "rounded-[14px] border border-border bg-card shadow-xs";

// ── Hero ────────────────────────────────────────────────────────────────────

const R = 70;
const STROKE = 26;

function Donut({ sections, total }: { sections: BibliotecaSectionStat[]; total: number }) {
  let start = 0;
  const arcs = total > 0
    ? sections
        .filter((stat) => stat.count > 0)
        .map((stat) => {
          const pct = (stat.count / total) * 100;
          const arc = { key: stat.key, pct, start, color: stat.color };
          start += pct;
          return arc;
        })
    : [];
  return (
    <div role="img" aria-label={`Documentos por sección: ${total} en total`} className="relative size-[180px] flex-none">
      <svg viewBox="0 0 180 180" className="size-full" aria-hidden="true">
        <circle cx={90} cy={90} r={R} fill="none" strokeWidth={STROKE} className="stroke-muted" />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={90}
            cy={90}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - arc.pct}
            transform={`rotate(${-90 + arc.start * 3.6} 90 90)`}
            className={cn("ring", slot(arc.color).stroke)}
            style={{ "--ring-offset": `${100 - arc.pct}` } as CSSProperties}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-mono text-[30px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">documentos</span>
      </div>
    </div>
  );
}

function Hero({ overview }: { overview: BibliotecaOverview }) {
  const headingId = useId();
  const legend = overview.sections.filter((stat) => stat.color !== null);
  return (
    <section aria-labelledby={headingId} className={cn(CARD, "rise flex flex-wrap items-center gap-7 px-7 py-6")}>
      <Donut sections={legend} total={overview.total} />
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          Tu biblioteca de un vistazo
        </h2>
        <p className="text-[13.5px] text-muted-foreground">
          <span className="font-mono tabular-nums">{overview.newThisWeek}</span>{" "}
          {overview.newThisWeek === 1 ? "documento nuevo esta semana" : "documentos nuevos esta semana"}
        </p>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px]">
          {legend.map((stat) => (
            <li key={stat.key} className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className={cn("size-2.5 flex-none rounded-[3px]", slot(stat.color).dot)} />
              <span className="min-w-0 truncate text-foreground">{stat.title}</span>
              <span className="ml-auto font-mono font-medium tabular-nums text-foreground">{stat.count}</span>
            </li>
          ))}
        </ul>
      </div>
      {overview.manualHighlight ? (
        <div className="flex min-w-0 flex-[0_1_300px] flex-col gap-2 rounded-xl bg-secondary px-[18px] py-4">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-secondary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
            Nuevo en el manual
          </p>
          <p className="text-sm font-semibold text-foreground">{overview.manualHighlight.title}</p>
          <Link href={overview.manualHighlight.href} className={cn("w-fit text-[13px] font-medium text-secondary-foreground hover:underline", FOCUS)}>
            Leer ahora →
          </Link>
        </div>
      ) : null}
    </section>
  );
}

// ── Abiertos recientemente ──────────────────────────────────────────────────

function Badge({ badge }: { badge: DocumentBadge }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium",
        BADGE_CLASS[badge] ?? "bg-muted text-foreground",
      )}
    >
      {badge}
    </span>
  );
}

function Preview({ title, thumbnail, color, height, angle }: { title: string; thumbnail: string | null; color: string; height: string; angle: number }) {
  if (thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element -- Drive thumbnails, not an optimizable static asset
    return <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn("w-full object-cover", height)} />;
  }
  return (
    <div aria-hidden="true" className={cn("flex w-full items-center justify-center", height)} style={stripe(color, angle)}>
      <span className="rounded-md bg-card/80 px-2 py-0.5 text-xs text-muted-foreground">Vista previa · {firstWord(title)}</span>
    </div>
  );
}

type RecentCard = { doc: RecentDocument; href: string; link: ResourceLink | null };

function Recents({ items, now }: { items: RecentCard[]; now: Date }) {
  const headingId = useId();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const start = track.scrollLeft <= 1;
    const end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    track.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(track);
    return () => {
      track.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure, items.length]);

  const scroll = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track || (direction === -1 ? edges.start : edges.end)) return;
    track.scrollBy?.({ left: direction * CAROUSEL_STEP, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const empty = items.length === 0;

  return (
    <section role="region" aria-roledescription="carrusel" aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          Abiertos recientemente
        </h2>
        {empty ? null : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 rounded-[10px]"
              aria-label="Anteriores"
              aria-disabled={edges.start}
              onClick={() => scroll(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 rounded-[10px]"
              aria-label="Siguientes"
              aria-disabled={edges.end}
              onClick={() => scroll(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      {empty ? (
        <div className={CARD}>
          <EmptyState title="Aún no has abierto documentos." description="Abre un documento de Google para verlo aquí." />
        </div>
      ) : (
        <ul ref={trackRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-0.5 pb-3 pt-1">
          {items.map(({ doc, href, link }, index) => {
            const sectionColor = sectionSlot(doc.section);
            const meta = `${sectionLabel(doc.section)} · ${relativeOpened(doc.openedAt, now)}`;
            return (
              <li key={doc.id} className="w-[236px] flex-none snap-start">
                <CardLink
                  href={href}
                  label={`${doc.title} · ${meta}`}
                  className={cn(CARD, "rise lift flex h-full flex-col overflow-hidden", FOCUS)}
                  style={staggerStyle(index)}
                >
                  <span className="relative block">
                    <Preview
                      title={doc.title}
                      thumbnail={link?.drive?.thumbnailLink ?? null}
                      color={sectionColor.stripe}
                      height="h-[132px]"
                      angle={135}
                    />
                    <Badge badge={documentBadge(link ?? { linkType: "drive_file", url: doc.url, drive: null })} />
                  </span>
                  <span className="flex flex-col gap-1 px-3.5 py-3">
                    <span title={doc.title} className="line-clamp-2 text-sm font-semibold text-foreground">
                      {doc.title}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">{meta}</span>
                  </span>
                </CardLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The colors of a document's section (every `ResourceSection` is a card key). */
function sectionSlot(section: ResourceSection): SlotClasses {
  return slot(BIBLIOTECA_SECTION_COLOR[section]);
}

function SectionIcon({ name, className }: { name: string; className?: string }) {
  const resolved = resolveIconName(name);
  if (!resolved) return <Shapes className={className} aria-hidden="true" />;
  return <DynamicIcon name={resolved} className={className} aria-hidden="true" />;
}

// ── Secciones ───────────────────────────────────────────────────────────────

function SectionCard({ stat, footer, vacation, index }: { stat: BibliotecaSectionStat; footer: string; vacation: NextVacation | null; index: number }) {
  const colors = slot(stat.color);
  const vacations = stat.key === "mis-vacaciones";
  const countText = vacations ? (vacation ? plural(vacation.available, "día", "días") : null) : plural(stat.count, "documento", "documentos");
  const label = [stat.title, countText, footer].filter(Boolean).join(" · ");
  return (
    <li className="min-w-0">
      <CardLink
        href={stat.href}
        label={label}
        className={cn(CARD, "rise lift flex h-full min-w-0 flex-col gap-3.5 p-5", FOCUS)}
        style={staggerStyle(index)}
      >
        <span className="flex items-start justify-between gap-3">
          <span aria-hidden="true" className={cn("inline-flex size-[52px] flex-none items-center justify-center rounded-[14px]", colors.tile)}>
            <SectionIcon name={stat.iconName} className="size-6" />
          </span>
          {vacations ? (
            vacation ? (
              <span className="font-mono text-[30px] font-semibold tabular-nums leading-none text-foreground">
                {vacation.available}
                <span className="ml-1 font-sans text-sm font-medium text-muted-foreground">días</span>
              </span>
            ) : null
          ) : (
            <span className="font-mono text-[30px] font-semibold tabular-nums leading-none text-foreground">{stat.count}</span>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span title={stat.title} className="line-clamp-2 text-[15px] font-semibold text-foreground">
            {stat.title}
          </span>
          <span className="text-[13px] text-muted-foreground">{stat.description}</span>
        </span>
        <span className={cn("mt-auto flex items-center gap-1.5 text-[12.5px]", colors.ink)}>
          <span aria-hidden="true" className={cn("size-1.5 flex-none rounded-full", colors.dot)} />
          <span className="min-w-0 truncate">{footer}</span>
        </span>
      </CardLink>
    </li>
  );
}

function Sections({ overview, ctx }: { overview: BibliotecaOverview; ctx: FooterContext }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold text-foreground">
        Secciones
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overview.sections.map((stat, index) => (
          <SectionCard key={stat.key} stat={stat} footer={sectionFooter(stat, ctx)} vacation={ctx.vacation} index={index} />
        ))}
      </ul>
    </section>
  );
}

// ── Plantillas destacadas ───────────────────────────────────────────────────

function Templates({ templates, total, onPreview }: { templates: ResourceLink[]; total: number; onPreview(link: ResourceLink): void }) {
  const headingId = useId();
  const color = slot(1).stripe;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          Plantillas destacadas
        </h2>
        <Link
          href="/biblioteca/plantillas-diseno"
          className={cn("text-[13px] font-medium text-secondary-foreground hover:underline", FOCUS)}
        >
          Ver las <span className="font-mono tabular-nums">{total}</span> →
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((link, index) => (
          <li key={link.id} className="min-w-0">
            <article className={cn(CARD, "rise lift flex h-full flex-col overflow-hidden")} style={staggerStyle(index)}>
              <Preview title={link.title} thumbnail={link.drive?.thumbnailLink ?? null} color={color} height="h-[150px]" angle={45} />
              <div className="flex flex-col gap-2 px-[18px] py-4">
                <h3 title={link.title} className="line-clamp-2 text-[15px] font-semibold text-foreground">
                  {link.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={templateUseHref(link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Usar plantilla: ${link.title}`}
                    className={cn(buttonVariants({ size: "sm" }), "h-8 rounded-[10px] text-[13px]")}
                  >
                    Usar plantilla
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-[10px] text-[13px]"
                    aria-label={`Vista previa: ${link.title}`}
                    onClick={() => onPreview(link)}
                  >
                    Vista previa
                  </Button>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TemplatePreviewSheet({ link, onClose }: { link: ResourceLink | null; onClose(): void }) {
  const [drivePreview, setDrivePreview] = useState<DriveBrowserEntry | null>(null);
  return (
    <>
      <Sheet open={link !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
        <SheetContent className="w-[90vw] max-w-5xl gap-0 p-0" side="right">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <SheetTitle className="truncate">{link?.title}</SheetTitle>
              <SheetDescription>Plantillas de diseño</SheetDescription>
            </div>
            {link ? (
              <div className="flex gap-2">
                <a href={templateUseHref(link)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
                  Usar plantilla
                </a>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {link.linkType === "web" ? "Abrir enlace" : "Abrir en Drive"}
                </a>
              </div>
            ) : null}
          </div>
          <ResourcePreview
            link={link}
            title="Plantillas de diseño"
            unavailableReason={
              link?.linkType === "web"
                ? "El enlace seleccionado es tipo web y no admite vista previa embebida."
                : "No se pudo generar vista previa. Verifica que sea un enlace válido y compartido de Google Drive o Google Docs."
            }
            onDriveFileClick={setDrivePreview}
            heightClass="h-[calc(100vh-5rem)]"
          />
        </SheetContent>
      </Sheet>
      <DriveFilePreviewSheet entry={drivePreview} onClose={() => setDrivePreview(null)} />
    </>
  );
}

// ── Loading ─────────────────────────────────────────────────────────────────

function VisualSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando la biblioteca">
      <Skeleton className="h-[228px] rounded-[14px]" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[200px] w-[236px] flex-none rounded-[14px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[180px] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

/**
 * `/biblioteca` in the Visual style (frame `Biblioteca-Visual`): the hero
 * (donut per section, new this week, the newest Manual part), the
 * "Abiertos recientemente" carousel with previews, one card per section and
 * the three newest design templates. Hero and templates hide while
 * searching; the cards and recents follow the search.
 */
export function BibliotecaVisual(props: BibliotecaLayoutProps) {
  const { links, showEmpresa, showRecursos, query, recents, vacations, isPending, now, today } = props;
  const remember = useRecentDocs((state) => state.remember);
  const [preview, setPreview] = useState<ResourceLink | null>(null);

  const searching = query.trim().length > 0;
  const overview = useMemo(
    () => buildBibliotecaOverview(links, { showEmpresa, showRecursos, query, now }),
    [links, showEmpresa, showRecursos, query, now],
  );
  const vacation = useMemo(() => nextVacation(vacations, today), [vacations, today]);
  const manualUpdated = useMemo(() => showEmpresa && manualRecentlyUpdated(links, now), [links, showEmpresa, now]);
  const byId = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);
  const recentCards = useMemo<RecentCard[]>(
    () =>
      recents
        .filter((doc) => (doc.section === "empresa" ? showEmpresa : showRecursos))
        .filter((doc) => matchesSearch(query, doc.title))
        .map((doc) => ({ doc, href: recentDocumentHref(links, doc), link: byId.get(doc.id) ?? null })),
    [recents, query, links, byId, showEmpresa, showRecursos],
  );
  const templates = useMemo(() => (showRecursos ? featuredTemplates(links) : []), [links, showRecursos]);
  const templateTotal = useMemo(() => links.filter((link) => link.section === "plantillas-diseno").length, [links]);

  if (isPending) return <VisualSkeleton />;

  if (searching && overview.sections.length === 0 && recentCards.length === 0) {
    return (
      <div className={CARD}>
        <EmptyState title="Sin resultados" description={`Nada en la biblioteca coincide con “${query.trim()}”.`} />
      </div>
    );
  }

  const openPreview = (link: ResourceLink) => {
    remember(link);
    setPreview(link);
  };

  return (
    <div className="flex flex-col gap-6">
      {searching ? null : <Hero overview={overview} />}
      {searching && recentCards.length === 0 ? null : <Recents items={recentCards} now={now} />}
      {overview.sections.length > 0 ? <Sections overview={overview} ctx={{ overview, manualUpdated, vacation }} /> : null}
      {searching || templates.length === 0 ? null : <Templates templates={templates} total={templateTotal} onPreview={openPreview} />}
      <TemplatePreviewSheet link={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

