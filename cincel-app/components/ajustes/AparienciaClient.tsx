"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/shadcn/badge";
import { useAppearance } from "@/lib/stores/appearance-store";
import type { UserPreferences } from "@/lib/types/redesign";
import { cn } from "@/lib/utils";

import {
  AparienciaDensidadSection,
  AparienciaEstiloSection,
  AparienciaModoSection,
  AparienciaTamanoTextoSection,
  AparienciaTemaSection,
} from "./AparienciaSections";

export { toTextSize } from "./AparienciaSections";

export type AparienciaClientProps = {
  /**
   * The visible sections from `settingsSectionsFor("apariencia", user)`;
   * defaults to all of them in order.
   */
  children?: ReactNode;
};

function DefaultSections() {
  return (
    <>
      <AparienciaTemaSection />
      <AparienciaEstiloSection />
      <AparienciaModoSection />
      <AparienciaDensidadSection />
      <AparienciaTamanoTextoSection />
    </>
  );
}

const PREVIEW_ROWS = [
  { task: "Planos arquitectónicos", status: "En proceso" },
  { task: "Cotización de cancelería", status: "Pendiente" },
  { task: "Visita de obra", status: "Completado" },
];

/** Live "Vista previa": the current tokens with the chosen density and text size. */
function AparienciaPreview({ density, textSize }: { density: UserPreferences["density"]; textSize: number }) {
  const compact = density === "compacta";
  return (
    <section aria-labelledby="apariencia-vista-previa" className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start">
      <h2 id="apariencia-vista-previa" className="text-sm font-semibold text-foreground">
        Vista previa
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex">
          <div aria-hidden="true" className="flex w-10 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-2">
            <span className="size-6 rounded-md bg-sidebar-primary" />
            <span className="h-1.5 rounded-full bg-sidebar-accent" />
            <span className="h-1.5 rounded-full bg-sidebar-accent" />
          </div>
          <div data-testid="apariencia-preview-body" className="min-w-0 flex-1 p-3" style={{ fontSize: `${textSize}px` }}>
            <div className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", compact ? "p-3" : "p-4")}>
              <p className="text-base font-semibold">Casa Lomas</p>
              <p className="text-muted-foreground">Diseño · 12 tareas abiertas</p>
              <ul className="mt-2 divide-y divide-border">
                {PREVIEW_ROWS.map((row) => (
                  <li key={row.task} className={cn("flex items-center justify-between gap-2", compact ? "py-1.5" : "py-2.5")}>
                    <span className="truncate">{row.task}</span>
                    <Badge variant="outline">{row.status}</Badge>
                  </li>
                ))}
              </ul>
              <span aria-hidden="true" className="mt-3 inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground">
                Nueva tarea
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Ajustes › Apariencia (redesign FE §3.8): theme, style, mode, density, text
 * size and preview. No page state of its own: the sections and the preview
 * read and write the `useAppearance` store (optimistic, rolled back on
 * error, text size debounced once in the store) and the hydrated
 * `qk.ajustes.page('apariencia')`.
 */
export function AparienciaClient({ children }: AparienciaClientProps) {
  const density = useAppearance((s) => s.preferences.density);
  const textSize = useAppearance((s) => s.preferences.textSize);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">{children ?? <DefaultSections />}</div>
      <AparienciaPreview density={density} textSize={textSize} />
    </div>
  );
}
