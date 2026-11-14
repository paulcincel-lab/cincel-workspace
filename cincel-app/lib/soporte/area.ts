import { TICKET_AREAS, type TicketArea } from "@/lib/types/soporte";

/** First path segment that is not an area, mapped to the area it belongs to. */
const SEGMENT_AREA: Record<string, TicketArea> = {
  etapas: "proyectos",
  clientes: "proyectos",
};

/** Route group a solicitud was filed from, derived from the client path; `otro` when it matches none. */
export function areaFromPath(path: string): TicketArea {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const segment = pathname.split("/").find((part) => part.length > 0)?.toLowerCase() ?? "";
  if ((TICKET_AREAS as readonly string[]).includes(segment) && segment !== "otro") return segment as TicketArea;
  return SEGMENT_AREA[segment] ?? "otro";
}
