import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/shadcn/skeleton";

/**
 * Loading skeletons shared by the page layouts and the `loading.tsx` route
 * boundaries. They live apart from the layouts so a loading boundary loads
 * only these blocks, not the whole layout and its data hooks.
 */

/** Rows of "Próximas tareas" and files of the Resumen Esencial layout. */
export const RESUMEN_ESENCIAL_NEXT_TASKS = 5;
export const RESUMEN_ESENCIAL_FILES = 3;

/** Loading: header, one pill row and six card blocks in the card grid. */
export function ProjectsEsencialSkeleton(): ReactNode {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando proyectos" className="flex flex-col gap-5" data-slot="projects-esencial-skeleton">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {[96, 112, 104, 128].map((w) => (
          <Skeleton key={w} className="h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[190px] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}

/**
 * The /proyectos Visual skeleton (`ProjectsVisualLayout`, `app/(staff)/proyectos/loading.tsx`): header, four
 * summary blocks, three attention blocks, four board columns of three cards
 * and the timeline. `Skeleton` pulses only without reduced motion.
 */
export function ProjectsVisualSkeleton(): ReactNode {
  const blocks = (n: number) => Array.from({ length: n }, (_, i) => i);
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-slot="projects-visual-skeleton" className="flex flex-col gap-5">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="flex flex-col gap-5 [&_[data-slot=skeleton]]:motion-reduce:animate-none">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {blocks(4).map((i) => (
            <Skeleton key={i} data-skeleton="summary" className="h-[138px] rounded-[14px]" />
          ))}
        </div>
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {blocks(3).map((i) => (
            <Skeleton key={i} data-skeleton="attention" className="h-[300px] rounded-[14px]" />
          ))}
        </div>
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {blocks(4).map((c) => (
            <div key={c} data-skeleton="column" className="flex flex-col gap-2.5 rounded-[14px] bg-accent p-3">
              <Skeleton className="h-4 w-1/2" />
              {blocks(3).map((i) => (
                <Skeleton key={i} data-skeleton="card" className="h-24 rounded-[10px]" />
              ))}
            </div>
          ))}
        </div>
        <Skeleton data-skeleton="timeline" className="h-[180px] rounded-[14px]" />
      </div>
    </div>
  );
}

/** Loading layout: 130 px tramo block, then 5 rows + quick-add | 110 px + 3 rows. */
export function ResumenEsencialSkeleton(): ReactNode {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando…" className="flex flex-col gap-5">
      <Skeleton className="h-[130px] rounded-lg" />
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-2">
          {Array.from({ length: RESUMEN_ESENCIAL_NEXT_TASKS }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
          <Skeleton className="h-11 rounded-md" />
        </div>
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <Skeleton className="h-[110px] rounded-lg" />
          {Array.from({ length: RESUMEN_ESENCIAL_FILES }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}
