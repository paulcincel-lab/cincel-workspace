"use client";

import type { ProjectListItem } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

export type ProjectsPortfolioProps = { projects: ProjectListItem[]; portfolio: PortfolioRow[] };

/**
 * /proyectos list in three styles (redesign FE §3.5, §4.6): `ListPage` cards +
 * "Proyectos por tramo".
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ProjectsPortfolio(props: ProjectsPortfolioProps) {
  void props;
  return null;
}
