"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";

import { pushPortalHref } from "@/components/portal/PortalProjectTabs";
import {
  formatPortalFileSize,
  PORTAL_OVERVIEW_COPY,
  PORTAL_TRAMO_STATE_LABEL,
  portalFileType,
  portalInitials,
  type PortalOverviewData,
  type PortalRecentFile,
} from "@/lib/portal/overview";
import { portalDocumentDownloadUrl, portalProjectTabHref } from "@/lib/portal/project-tabs";
import { tramoColorSlot, type TramoColorSlot } from "@/lib/tramos/tramo-color";
import type { PortalProjectDTO, PortalTeamMemberDTO, PortalTramoDTO } from "@/lib/types/portal";
import type { AgendaItem } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Portal Resumen in the Visual style (frame `Portal-Visual`): hero with the project's photo (or a gradient)
 * and the overall progress ring, the tramos as bars, the next four deliveries on a timeline, the newest shared
 * documents as cards and the Cincel team. Rendered by `PortalProjectOverview` through `PageStyleLayout`; every
 * value comes from the allow-listed portal DTOs via `PortalOverviewData`. Motion only through the shared
 * utilities (`anim-in`, `lift`, `ring`, `grow-x`), all off under `prefers-reduced-motion`.
 */

export const PORTAL_VISUAL_COPY = {
  avanceGeneral: "AVANCE GENERAL",
  proximaEntrega: "Próxima entrega",
  enTramo: (name: string) => `En ${name}`,
  tramosEnMarcha: (n: number, total: number) => `${n} de ${total} tramos en marcha`,
  entregaFinal: "entrega final estimada",
  entregaFinalSola: "Entrega final estimada",
  verTodos: "Ver todos →",
  vistaPrevia: "VISTA PREVIA",
  equipo: "Tu equipo Cincel",
  escribir: "Escribir",
} as const;

export type PortalVisualProps = { project: PortalProjectDTO; data: PortalOverviewData };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `YYYY-MM-DD…` → `14 nov`. */
export function portalDayMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`.trim() : iso;
}

/** `YYYY-MM…` → `abr 2027`. */
export function portalMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim() : iso;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

/** CSS variables of a tramo color slot: `--pv-color` (dot, bar) and `--pv-ink` (text on card or tint). */
function colorVars(slot: TramoColorSlot | null): CSSProperties {
  const vars: Record<string, string> = slot
    ? { "--pv-color": `var(--chart-${slot})`, "--pv-ink": `var(--chart-${slot}-ink)` }
    : { "--pv-color": "var(--muted-foreground)", "--pv-ink": "var(--foreground)" };
  return vars as CSSProperties;
}

/** `chart-N-tint` = the slot color mixed into `card`, 14 % light / 22 % dark (FE §14.5). */
const TINT_BG =
  "bg-[color-mix(in_oklab,var(--pv-color)_14%,var(--card))] dark:bg-[color-mix(in_oklab,var(--pv-color)_22%,var(--card))]";

function slotOf(tramo: PortalTramoDTO, index: number): TramoColorSlot | null {
  return tramoColorSlot({ key: tramo.key, sortOrder: index + 1 });
}

const CARD = "rounded-[14px] border bg-card shadow-xs";

function Section({
  title,
  action,
  card = true,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  card?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("anim-in flex min-w-0 flex-col", card ? cn(CARD, "gap-4 p-5 sm:p-6") : "gap-3.5", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-[15px] font-semibold">
          {title}
        </h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

/** The cover photo from `/api/portal/projects/[pid]/cover`; hidden until it loads, gone on 404. */
function CoverPhoto({ projectId }: { projectId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  if (state === "missing") return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a session-bound portal route, not an optimizable asset */}
      <img
        src={`/api/portal/projects/${encodeURIComponent(projectId)}/cover`}
        alt=""
        aria-hidden="true"
        className={cn("absolute inset-0 size-full object-cover", state === "ready" ? "opacity-100" : "opacity-0")}
        onLoad={() => setState("ready")}
        onError={() => setState("missing")}
      />
      {state === "ready" ? (
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-card/95 via-card/60 to-transparent" />
      ) : null}
    </>
  );
}

function HeroPanel({ project, data }: PortalVisualProps) {
  const heroIndex = data.heroTramo ? data.tramos.indexOf(data.heroTramo) : -1;
  const heroSlot = data.heroTramo ? slotOf(data.heroTramo, heroIndex) : null;
  return (
    <div
      className={cn(
        "relative flex min-h-[300px] min-w-0 flex-col justify-end overflow-hidden rounded-[14px] border p-6 sm:p-7 lg:col-span-2",
        "bg-linear-135 from-secondary to-[color-mix(in_oklab,var(--chart-2)_14%,var(--card))]",
        "dark:to-[color-mix(in_oklab,var(--chart-2)_22%,var(--card))]",
      )}
    >
      <CoverPhoto projectId={project.id} />
      <div className="relative flex min-w-0 flex-col">
        {project.address ? <p className="break-words text-[13px]">{project.address}</p> : null}
        <h1 className="mt-1 break-words text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[36px]">
          {project.name}
        </h1>
        {data.heroTramo || data.nextEntrega ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.heroTramo ? (
              <span
                style={colorVars(heroSlot)}
                className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[13px] font-medium"
              >
                <span aria-hidden="true" className="size-2 rounded-full bg-(--pv-color)" />
                {PORTAL_VISUAL_COPY.enTramo(data.heroTramo.name)}
              </span>
            ) : null}
            {data.nextEntrega ? (
              <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-[13px]">
                {PORTAL_VISUAL_COPY.proximaEntrega} ·&nbsp;
                <span className="font-mono font-semibold tabular-nums">{portalDayMonth(data.nextEntrega.start)}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const RING_R = 48;

function RingCard({ project, data }: PortalVisualProps) {
  const pct = clampPct(project.progressPct);
  const total = data.tramos.length;
  const end = project.endDate ? portalMonthYear(project.endDate) : null;
  return (
    <div className={cn(CARD, "lift flex min-w-0 flex-col items-center gap-3 p-6")}>
      <span className="self-start font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
        {PORTAL_VISUAL_COPY.avanceGeneral}
      </span>
      <svg width="160" height="160" viewBox="0 0 120 120" role="img" aria-label={`Avance general ${pct} %`}>
        <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--accent)" strokeWidth="12" />
        <circle
          className="ring"
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="12"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pct}
          style={{ "--ring-offset": 100 - pct } as CSSProperties}
          transform="rotate(-90 60 60)"
          opacity={pct === 0 ? 0 : 1}
        />
        <text
          x="60"
          y="67"
          textAnchor="middle"
          className="fill-foreground text-[22px] font-semibold tabular-nums"
          aria-hidden="true"
        >
          {`${pct} %`}
        </text>
      </svg>
      {total > 0 || end ? (
        <p className="text-center text-[13px]">
          {total > 0 ? PORTAL_VISUAL_COPY.tramosEnMarcha(data.tramosActive, total) : null}
          {end ? (
            <>
              {total > 0 ? ` · ${PORTAL_VISUAL_COPY.entregaFinal} ` : `${PORTAL_VISUAL_COPY.entregaFinalSola} `}
              <span className="font-mono font-semibold tabular-nums">{end}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

// ── Fases ────────────────────────────────────────────────────────────────────

function tramoStateText(tramo: PortalTramoDTO): string {
  if (tramo.state === "completado") return `${PORTAL_TRAMO_STATE_LABEL.completado} · 100 %`;
  if (tramo.state === "en_curso") return `${PORTAL_TRAMO_STATE_LABEL.en_curso} · ${clampPct(tramo.progressPct)} %`;
  return tramo.startMonth
    ? `${PORTAL_TRAMO_STATE_LABEL.por_iniciar} · ${portalMonthYear(tramo.startMonth)}`
    : PORTAL_TRAMO_STATE_LABEL.por_iniciar;
}

function PhaseBar({ tramo, index }: { tramo: PortalTramoDTO; index: number }) {
  const pct = tramo.state === "completado" ? 100 : tramo.state === "por_iniciar" ? 0 : clampPct(tramo.progressPct);
  const label = PORTAL_TRAMO_STATE_LABEL[tramo.state];
  return (
    <div className="flex min-w-0 flex-col gap-2" style={colorVars(slotOf(tramo, index))}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${tramo.name}, ${label.toLowerCase()}`}
        className={cn(
          "h-2 overflow-hidden rounded-full",
          tramo.state === "completado" ? "bg-(--pv-color)" : tramo.state === "en_curso" ? TINT_BG : "bg-accent",
        )}
      >
        {tramo.state === "en_curso" && pct > 0 ? (
          <div className="grow-x h-full rounded-full bg-(--pv-color)" style={{ width: `${pct}%` }} />
        ) : null}
      </div>
      <span className="break-words text-sm font-semibold">{tramo.name}</span>
      <span
        className={cn(
          "text-[12.5px] tabular-nums",
          tramo.state === "por_iniciar" ? "text-muted-foreground" : "text-(--pv-ink)",
        )}
      >
        {tramoStateText(tramo)}
      </span>
    </div>
  );
}

function FasesCard({ tramos }: { tramos: PortalTramoDTO[] }) {
  return (
    <Section title={PORTAL_OVERVIEW_COPY.fases}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tramos.map((tramo, index) => (
          <PhaseBar key={tramo.key} tramo={tramo} index={index} />
        ))}
      </div>
    </Section>
  );
}

// ── Próximas entregas ────────────────────────────────────────────────────────

/** How many deliveries the timeline shows. */
export const PORTAL_VISUAL_ENTREGAS = 4;

function EntregasCard({ entregas, slot }: { entregas: AgendaItem[]; slot: TramoColorSlot | null }) {
  const items = entregas.slice(0, PORTAL_VISUAL_ENTREGAS);
  return (
    <Section title={PORTAL_OVERVIEW_COPY.entregas} className="gap-[18px]">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{PORTAL_OVERVIEW_COPY.entregasVacio}</p>
      ) : (
        <div className="relative" style={colorVars(slot)}>
          {/* The connector: vertical on the left at phone width, horizontal at the dots' height from 640 px. */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[7px] w-0.5 bg-border sm:top-[7px] sm:right-2 sm:bottom-auto sm:left-2 sm:h-0.5 sm:w-auto"
          />
          <ol className="relative grid grid-cols-1 gap-5 sm:grid-cols-4 sm:gap-4">
            {items.map((item) => (
              <li key={item.id} className="relative flex min-w-0 gap-3 sm:flex-col sm:gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-full border-[3px] border-card bg-(--pv-color) shadow-[0_0_0_1px_var(--border)]"
                />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-[12.5px] tabular-nums text-(--pv-ink)">{portalDayMonth(item.start)}</span>
                  <span className="break-words text-sm font-medium">{item.title}</span>
                  {item.project ? <span className="text-[12.5px] text-muted-foreground">{item.project}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}

// ── Documentos compartidos ───────────────────────────────────────────────────

const IMAGE_TYPES = new Set(["JPG", "JPEG", "PNG", "WEBP", "GIF", "HEIC", "SVG", "IMAGEN"]);
const SHEET_TYPES = new Set(["XLSX", "XLS", "CSV", "ODS", "NUMBERS"]);

/** Tile tint per document type: PDF violet, images blue, spreadsheets cyan, the rest neutral. */
function typeSlot(type: string): TramoColorSlot | null {
  const t = type.toUpperCase();
  if (t === "PDF") return 2;
  if (IMAGE_TYPES.has(t)) return 1;
  if (SHEET_TYPES.has(t)) return 4;
  return null;
}

function DocumentCard({ projectId, file }: { projectId: string; file: PortalRecentFile }) {
  const type = portalFileType(file);
  const slot = typeSlot(type);
  const meta = [file.folder, file.modifiedAt ? portalDayMonth(file.modifiedAt) : null, formatPortalFileSize(file.sizeBytes)]
    .filter(Boolean)
    .join(" · ");
  return (
    <a
      href={portalDocumentDownloadUrl(projectId, file.id)}
      aria-label={`${PORTAL_OVERVIEW_COPY.descargar} ${file.name}`}
      title={file.name}
      className="lift flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-card"
    >
      <span
        aria-hidden="true"
        style={colorVars(slot)}
        className={cn(
          "flex h-[120px] items-center justify-center font-mono text-[11px] tracking-[0.08em]",
          slot ? cn(TINT_BG, "text-(--pv-ink)") : "bg-muted text-foreground",
        )}
      >
        {`${PORTAL_VISUAL_COPY.vistaPrevia} · ${type.toUpperCase()}`}
      </span>
      <span className="line-clamp-2 break-words px-3.5 pt-3 pb-1 text-[13.5px] font-medium">{file.name}</span>
      <span className="px-3.5 pb-3.5 text-xs text-muted-foreground tabular-nums">{meta}</span>
    </a>
  );
}

function DocumentosSection({ projectId, files }: { projectId: string; files: PortalRecentFile[] }) {
  const href = portalProjectTabHref(projectId, "archivos");
  return (
    <Section
      title={PORTAL_OVERVIEW_COPY.documentos}
      card={false}
      action={
        <a href={href} onClick={(event) => pushPortalHref(event, href)} className="text-[13px] text-secondary-foreground hover:underline">
          {PORTAL_VISUAL_COPY.verTodos}
        </a>
      }
    >
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{PORTAL_OVERVIEW_COPY.documentosVacio}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {files.map((file) => (
            <li key={file.id} className="flex min-w-0">
              <DocumentCard projectId={projectId} file={file} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Tu equipo Cincel ─────────────────────────────────────────────────────────

/** Avatar tint per position: secondary, then the chart-2 and chart-3 tints. */
function avatarClass(index: number): { className: string; style?: CSSProperties } {
  const k = index % 3;
  if (k === 0) return { className: "bg-secondary text-secondary-foreground" };
  return { className: cn(TINT_BG, "text-(--pv-ink)"), style: colorVars(k === 1 ? 2 : 3) };
}

export function portalMailto(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

function TeamCard({ member, index, projectName }: { member: PortalTeamMemberDTO; index: number; projectName: string }) {
  const avatar = avatarClass(index);
  return (
    <div className={cn(CARD, "lift flex min-w-0 items-center gap-3.5 p-[18px]")}>
      <span
        aria-hidden="true"
        style={avatar.style}
        className={cn("flex size-12 shrink-0 items-center justify-center rounded-full font-semibold", avatar.className)}
      >
        {portalInitials(member.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-sm font-semibold">{member.name}</span>
        {member.role ? <span className="break-words text-[12.5px] text-muted-foreground">{member.role}</span> : null}
      </span>
      {member.email ? (
        <a
          href={portalMailto(member.email, projectName)}
          aria-label={`${PORTAL_VISUAL_COPY.escribir} a ${member.name}`}
          className="shrink-0 text-[13px] text-secondary-foreground hover:underline"
        >
          {PORTAL_VISUAL_COPY.escribir}
        </a>
      ) : null}
    </div>
  );
}

function TeamSection({ team, projectName }: { team: PortalTeamMemberDTO[]; projectName: string }) {
  return (
    <Section title={PORTAL_VISUAL_COPY.equipo} card={false}>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {team.map((member, index) => (
          <li key={`${member.name}-${index}`} className="min-w-0">
            <TeamCard member={member} index={index} projectName={projectName} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PortalVisual({ project, data }: PortalVisualProps) {
  const heroIndex = data.heroTramo ? data.tramos.indexOf(data.heroTramo) : -1;
  const entregaSlot = data.heroTramo ? slotOf(data.heroTramo, heroIndex) : null;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-8" data-slot="portal-visual">
      <section aria-label={project.name} className="anim-in grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
        <HeroPanel project={project} data={data} />
        <RingCard project={project} data={data} />
      </section>
      {data.tramos.length > 0 ? <FasesCard tramos={data.tramos} /> : null}
      <EntregasCard entregas={data.entregas} slot={entregaSlot} />
      {data.documentos !== null ? <DocumentosSection projectId={project.id} files={data.recentFiles} /> : null}
      {data.team.length > 0 ? <TeamSection team={data.team} projectName={project.name} /> : null}
    </div>
  );
}
