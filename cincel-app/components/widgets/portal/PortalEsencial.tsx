"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { portalDocumentDownloadUrl } from "@/components/portal/PortalProjectOverview";
import { EsencialCard } from "@/components/widgets/EsencialCard";
import { initialsOf } from "@/lib/personas/team";
import { buildPortalStatusSentence, PORTAL_OVERVIEW_COPY, type PortalOverviewData } from "@/lib/portal/overview";
import { portalProjectTabHref } from "@/lib/portal/project-tabs";
import { tramoColorSlot, type TramoColorSlot } from "@/lib/tramos/tramo-color";
import type { PortalFileDTO, PortalProjectDTO, PortalTramoDTO } from "@/lib/types/portal";
import { cn } from "@/lib/utils";

export const PORTAL_ESENCIAL_COPY = {
  documentos: "Documentos recientes",
  verTodos: "Ver todos →",
  contacto: "Tu contacto en Cincel",
  escribir: "Escribir",
  terminado: "Proyecto terminado",
  porIniciar: "Aún no comenzamos",
} as const;

/** Literal classes so Tailwind keeps them; neutral when the tramo has no slot. */
const DOT_CLASS: Record<TramoColorSlot, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};
const INK_CLASS: Record<TramoColorSlot, string> = {
  1: "text-[color:var(--chart-1-ink)]",
  2: "text-[color:var(--chart-2-ink)]",
  3: "text-[color:var(--chart-3-ink)]",
  4: "text-[color:var(--chart-4-ink)]",
  5: "text-[color:var(--chart-5-ink)]",
};
const NOT_STARTED_DOT = "bg-[color:var(--border-strong)]";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `YYYY-MM-DD…` → `14 nov`. */
function dayMonth(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? ""}`.trim();
}

type RecentDoc = { id: string; name: string; modifiedAt: string };

/** Newest 3 files: across the folder groups when the page has them, else the root listing. Null hides the card. */
function recentDocuments(data: PortalOverviewData): RecentDoc[] | null {
  const recent = (data as { recentFiles?: PortalFileDTO[] }).recentFiles;
  if (recent && recent.length > 0) {
    return recent.slice(0, 3).map((f) => ({ id: f.id, name: f.name, modifiedAt: f.modifiedAt }));
  }
  if (data.documentos === null) return recent ? [] : null;
  return data.documentos.rows.slice(0, 3).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    modifiedAt: String(row.modifiedAt ?? ""),
  }));
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} />;
}

function StatusSentence({ project, data }: { project: PortalProjectDTO; data: PortalOverviewData }) {
  const s = buildPortalStatusSentence(data.tramos, data.entregas[0] ?? null, project.progressPct);
  const next = (date: string | null): ReactNode =>
    date ? (
      <>
        {" · próxima entrega "}
        <strong className="font-semibold tabular-nums">{dayMonth(date)}</strong>
      </>
    ) : null;

  let body: ReactNode;
  if (s.kind === "terminado") body = PORTAL_ESENCIAL_COPY.terminado;
  else if (s.kind === "por_iniciar") body = <>{PORTAL_ESENCIAL_COPY.porIniciar}{next(s.next)}</>;
  else if (s.kind === "sin_tramos")
    body = (
      <>
        {"Llevamos "}
        <span className="font-mono tabular-nums">{s.pct} %</span>
        {" de avance general"}
        {next(s.next)}
      </>
    );
  else
    body = (
      <>
        {"Vamos en "}
        <Dot className={cn("mx-0.5 align-middle", s.slot ? DOT_CLASS[s.slot] : "bg-muted-foreground")} />{" "}
        <strong className="font-semibold">{s.tramo}</strong>
        {", "}
        <span className="font-mono tabular-nums">{s.pct} %</span>
        {s.general ? " de avance general" : null}
        {next(s.next)}
      </>
    );

  return <p className="break-words text-[17px] text-foreground">{body}</p>;
}

function PhaseDots({ tramos }: { tramos: PortalTramoDTO[] }) {
  if (tramos.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
      {tramos.map((tramo, i) => {
        const slot = tramoColorSlot({ key: tramo.key, sortOrder: i + 1 });
        const color = tramo.state === "por_iniciar" ? NOT_STARTED_DOT : slot ? DOT_CLASS[slot] : "bg-muted-foreground";
        return (
          <span key={tramo.key} className="inline-flex items-center gap-2">
            {i > 0 ? <span aria-hidden>·</span> : null}
            <span className="inline-flex items-center gap-1.5">
              <Dot className={color} />
              <span className={cn("break-words", tramo.state === "en_curso" && "font-semibold text-foreground")}>
                {tramo.name}
              </span>
            </span>
          </span>
        );
      })}
    </p>
  );
}

function ContactCard({ project }: { project: PortalProjectDTO }) {
  const manager = project.manager;
  if (!manager) return null;
  return (
    <section
      aria-label={PORTAL_ESENCIAL_COPY.contacto}
      className="anim-in flex items-center gap-[14px] rounded-[14px] border bg-card px-[22px] py-4"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground"
      >
        {initialsOf(manager.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-sm font-semibold">{manager.name}</span>
        <span className="text-[12.5px] text-muted-foreground">{PORTAL_ESENCIAL_COPY.contacto}</span>
      </div>
      {manager.email ? (
        <a
          href={`mailto:${manager.email}?subject=${encodeURIComponent(project.name)}`}
          aria-label={`${PORTAL_ESENCIAL_COPY.escribir} a ${manager.name}`}
          className="shrink-0 text-[13px] text-secondary-foreground underline-offset-4 hover:underline"
        >
          {PORTAL_ESENCIAL_COPY.escribir}
        </a>
      ) : null}
    </section>
  );
}

export type PortalEsencialProps = {
  project: PortalProjectDTO;
  data: PortalOverviewData;
};

/**
 * Portal Resumen in Esencial: one status sentence, the phase dots and three short cards (próximas entregas,
 * documentos recientes, contacto). Reads only the portal DTOs; the contact is the project manager alone.
 */
export function PortalEsencial({ project, data }: PortalEsencialProps) {
  const current = data.tramos.findIndex((t) => t.state === "en_curso");
  const currentSlot =
    current === -1 ? null : tramoColorSlot({ key: data.tramos[current].key, sortOrder: current + 1 });
  const dateInk = currentSlot ? INK_CLASS[currentSlot] : "text-muted-foreground";
  const entregas = data.entregas.slice(0, 3);
  const docs = recentDocuments(data);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[760px] flex-col gap-5 px-4 pb-12 pt-8 sm:px-6">
      <div className="flex min-w-0 flex-col gap-[10px] py-2">
        <h1 className="break-words text-[28px] font-semibold tracking-[-0.02em]">{project.name}</h1>
        <StatusSentence project={project} data={data} />
        <PhaseDots tramos={data.tramos} />
      </div>

      <EsencialCard title={PORTAL_OVERVIEW_COPY.entregas} index={0}>
        {entregas.length === 0 ? (
          <p className="py-2.5 text-sm text-muted-foreground">{PORTAL_OVERVIEW_COPY.entregasVacio}</p>
        ) : (
          <ul className="flex flex-col">
            {entregas.map((e) => (
              <li key={e.id} className="flex items-baseline gap-4 border-b border-muted py-2.5 last:border-b-0">
                <span className={cn("w-14 shrink-0 font-mono text-[13px] tabular-nums", dateInk)}>{dayMonth(e.start)}</span>
                <span className="min-w-0 break-words text-sm">{e.title}</span>
              </li>
            ))}
          </ul>
        )}
      </EsencialCard>

      {docs ? (
        <EsencialCard
          title={PORTAL_ESENCIAL_COPY.documentos}
          index={1}
          action={
            <Link
              href={portalProjectTabHref(project.id, "archivos")}
              className="text-[13px] text-secondary-foreground underline-offset-4 hover:underline"
            >
              {PORTAL_ESENCIAL_COPY.verTodos}
            </Link>
          }
        >
          {docs.length === 0 ? (
            <p className="py-2.5 text-sm text-muted-foreground">{PORTAL_OVERVIEW_COPY.documentosVacio}</p>
          ) : (
            <ul className="flex flex-col">
              {docs.map((d) => (
                <li key={d.id} className="border-b border-muted last:border-b-0">
                  <a
                    href={portalDocumentDownloadUrl(project.id, d.id)}
                    aria-label={`${PORTAL_OVERVIEW_COPY.descargar} ${d.name}`}
                    className="flex min-w-0 items-baseline justify-between gap-4 py-2.5 text-sm hover:underline"
                  >
                    <span className="min-w-0 truncate" title={d.name}>
                      {d.name}
                    </span>
                    {d.modifiedAt ? (
                      <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-muted-foreground">
                        {dayMonth(d.modifiedAt)}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </EsencialCard>
      ) : null}

      <ContactCard project={project} />
    </div>
  );
}

export default PortalEsencial;
