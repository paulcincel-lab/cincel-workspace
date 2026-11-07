/**
 * `/tareas` search params (redesign FE §2.1, §4.5): one typed query for the
 * three views and the filters. Pure and client-safe.
 */
import { notImplemented } from "@/lib/stubs";

export type TareasVista = "tablero" | "lista" | "calendario";

export type TareasQuery = {
  vista: TareasVista;
  cal: "mes" | "semana" | "dia";
  tramo: string | null;
  responsable: "yo" | string | null;
  proyecto: string | null;
  estado: string | null;
  q: string | null;
  nueva?: boolean;
};

export function parseTareasQuery(sp: URLSearchParams): TareasQuery {
  return notImplemented("parseTareasQuery", sp);
}

/** `?…` for a partial query (round trip with `parseTareasQuery`). */
export function toTareasSearch(q: Partial<TareasQuery>): string {
  return notImplemented("toTareasSearch", q);
}
