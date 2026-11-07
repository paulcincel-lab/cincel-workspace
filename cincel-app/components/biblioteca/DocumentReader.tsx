"use client";

import type { ResourceLink } from "@/lib/types/resource";

export type DocumentReaderProps = { doc: ResourceLink; toc: { id: string; label: string }[] };

/**
 * Company document reader (redesign FE §3.7): left TOC, reading column, right
 * panel. Extends the `ResourcesWorkspace` viewer.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function DocumentReader(props: DocumentReaderProps) {
  void props;
  return null;
}
