"use client";

import type { ReactNode } from "react";

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader as BasePageHeader, type PageHeaderProps as BaseProps } from "@/components/v2/layout/PageHeader";

/**
 * The page header of every staff page: the base header
 * (`components/v2/layout/PageHeader.tsx`: breadcrumb, title + badge,
 * description, actions) with the Estilo switch as the last action.
 *
 * - The only place a staff page renders `EstiloSwitch` (placement guard);
 *   pages pass their own actions, which come first.
 * - `estilo={false}` on the pages with one style (Ajustes, the document
 *   reader, Tramos).
 * - The switch hides itself when the organization fixed the style, so the
 *   actions row then holds only the page actions.
 * - Tab order: breadcrumb links, page actions in DOM order, the Estilo
 *   radiogroup (one tab stop), then the page content.
 */
export type PageHeaderProps = BaseProps & {
  /** EstiloSwitch as the last action; default true */
  estilo?: boolean;
};

export function PageHeader({ estilo = true, actions, ...base }: PageHeaderProps): ReactNode {
  const all = estilo ? (
    <>
      {actions}
      <EstiloSwitch scope="staff" />
    </>
  ) : (
    actions
  );
  return <BasePageHeader {...base} actions={all} />;
}
