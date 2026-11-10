"use client";

import type { ReactNode } from "react";

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader as BasePageHeader, type PageHeaderProps as BaseProps } from "@/components/v2/layout/PageHeader";

/**
 * The page header of every staff page: the base header
 * (`components/v2/layout/PageHeader.tsx`) with the Estilo switch as the last
 * action. Final behavior in #980.
 */
export type PageHeaderProps = BaseProps & {
  /** EstiloSwitch as the last action; default true */
  estilo?: boolean;
};

export function PageHeader({ estilo = true, actions, ...base }: PageHeaderProps): ReactNode {
  const all = estilo ? (
    <>
      {actions}
      <EstiloSwitch />
    </>
  ) : (
    actions
  );
  return <BasePageHeader {...base} actions={all} />;
}
