"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { heatTone, ringOffset, etapaTone } from "@/components/widgets/resumen-tones";
import type { TeamLoadCard } from "@/lib/proyectos/project-summary";
import type { WorkflowRef } from "@/lib/types/core";

/**
 * "Equipo y carga" (Visual Resumen): two columns of people, each a 56 px load
 * ring (heat color by `OCCUPANCY_HEAT`, soft track) around a 40 px avatar
 * tinted by the person's dominant etapa, the name and a line in the heat
 * color: "{load} % · {n} vencidas" / "· {n} bloqueada" / "· al día" (counts
 * are this project's). At most `max` people, then "+{n}" linking to `moreHref`.
 */
export type TeamLoadWidgetProps = {
  people: TeamLoadCard[];
  etapaCatalog?: WorkflowRef[];
  max?: number;
  moreHref?: string;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "92 % · 2 vencidas", "60 % · 1 bloqueada", "40 % · al día". */
export function teamLoadLine(person: Pick<TeamLoadCard, "loadPct" | "overdueHere" | "blockedHere">): string {
  const detail =
    person.overdueHere > 0
      ? plural(person.overdueHere, "vencida", "vencidas")
      : person.blockedHere > 0
        ? plural(person.blockedHere, "bloqueada", "bloqueadas")
        : "al día";
  return `${Math.round(person.loadPct)} % · ${detail}`;
}

const R = 22;

export function TeamLoadWidget({ people, etapaCatalog = [], max = 6, moreHref }: TeamLoadWidgetProps): ReactNode {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-4">
        {shown.map((person) => {
          const heat = heatTone(person.loadPct);
          const tint = etapaTone(person.etapaKey, etapaCatalog);
          const pct = Math.max(0, Math.min(100, Math.round(person.loadPct)));
          return (
            <li key={person.id} className="flex min-w-0 items-center gap-3">
              <span className="relative size-14 flex-none">
                <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Carga ${pct} %`}>
                  <circle cx="28" cy="28" r={R} fill="none" stroke={heat.soft} strokeWidth="4" />
                  <circle
                    className="ring"
                    cx="28"
                    cy="28"
                    r={R}
                    fill="none"
                    stroke={heat.color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    pathLength={100}
                    transform="rotate(-90 28 28)"
                    style={{ ["--ring-offset" as string]: ringOffset(pct) } as CSSProperties}
                  />
                </svg>
                <span
                  aria-hidden="true"
                  className="absolute inset-2 flex items-center justify-center rounded-full text-[13px] font-semibold"
                  style={{ background: tint.soft, color: tint.ink }}
                >
                  {person.initials}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13.5px] font-semibold text-foreground">{person.name}</span>
                <span className={`font-mono text-xs tabular-nums ${heat.className}`}>{teamLoadLine(person)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {rest > 0 && moreHref ? (
        <Link
          href={moreHref}
          className="self-start text-[13px] font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Ver ${rest} personas más en la ficha`}
        >
          +{rest}
        </Link>
      ) : null}
    </div>
  );
}
