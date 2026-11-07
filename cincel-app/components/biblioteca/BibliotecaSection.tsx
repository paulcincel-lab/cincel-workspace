"use client";

import type { ResourceLink, ResourceSection } from "@/lib/types/resource";

export type BibliotecaSectionProps = { section: ResourceSection; links: ResourceLink[] };

/**
 * /biblioteca/[seccion] (redesign FE §3.7): evolves `ResourcesWorkspace`
 * (section mode) on `ListPage` + `RecordTable`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function BibliotecaSection(props: BibliotecaSectionProps) {
  void props;
  return null;
}
