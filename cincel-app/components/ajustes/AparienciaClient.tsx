"use client";

import type { ReactNode } from "react";

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
      <AparienciaModoSection />
      <AparienciaEstiloSection />
      <AparienciaTamanoTextoSection />
      <AparienciaDensidadSection />
    </>
  );
}

/**
 * Ajustes › Apariencia (redesign FE §3.8, canvas `Ajustes-Apariencia`):
 * Tema, Modo, Estilo, Tamaño de texto and Densidad, top to bottom. No page
 * state of its own: the sections read and write the `useAppearance` store
 * (applied at once, rolled back on error, text size debounced once in the
 * store) and the hydrated `qk.ajustes.page('apariencia')`. The same markup
 * for every presentation style.
 */
export function AparienciaClient({ children }: AparienciaClientProps) {
  return <div className="flex min-w-0 flex-col gap-4">{children ?? <DefaultSections />}</div>;
}
