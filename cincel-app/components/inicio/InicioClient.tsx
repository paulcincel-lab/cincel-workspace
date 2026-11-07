"use client";

import type { InicioData } from "@/lib/types/redesign";

export type InicioClientProps = { data: InicioData; photoUrl: string | null; me: { firstName: string; role: string } };

/**
 * /inicio client (redesign FE §3.2, §4.3): header block and the seven library
 * widgets from one `InicioData`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function InicioClient(props: InicioClientProps) {
  void props;
  return null;
}
