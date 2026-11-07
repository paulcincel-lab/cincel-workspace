"use client";

import type { ProjectDetail } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

export type ProjectSummaryProps = {
  project: ProjectDetail;
  portfolio: PortfolioRow | null;
  /** "Cliente y contactos": `canSeeAdminData`, or project member with `clients.canViewClients`. */
  showClientContacts: boolean;
};

/**
 * Proyecto · Resumen in three styles (redesign FE §3.5): composition of library
 * widgets.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ProjectSummary(props: ProjectSummaryProps) {
  void props;
  return null;
}
