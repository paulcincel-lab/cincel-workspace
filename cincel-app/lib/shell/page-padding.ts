/**
 * Page margins of the new shell (redesign FE §3, §14): the main column has
 * `padding: 0 28px 40px` and `gap: 16px` on desktop, with the page header
 * 20 px from the top (canvas frames Inicio, Tareas, Ajustes), and 16 px on
 * mobile (frames `Movil*`). Applied once, in the shell content wrapper, so
 * pages never add their own. Pure and client-safe.
 */

/** Padding + gap of the page content: 16 px below 768 px, `20px 28px 40px` from 768 px up. */
export const PAGE_CONTENT_CLASS = "flex min-w-0 flex-1 flex-col gap-4 p-4 md:px-7 md:pt-5 md:pb-10";

/** Full-bleed pages: no margins, the page fills the content area (frame AsistentePagina, `padding: 0`). */
export const FULL_BLEED_CONTENT_CLASS = "flex min-w-0 flex-1 flex-col";

/** Routes whose frame draws the page edge to edge. */
const FULL_BLEED_PREFIXES: readonly string[] = ["/asistente"];

/** True when `pathname` is a full-bleed page (the route itself or any sub-route). */
export function isFullBleedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FULL_BLEED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Class of the shell content wrapper for `pathname`. */
export function pageContentClass(pathname: string | null | undefined): string {
  return isFullBleedRoute(pathname) ? FULL_BLEED_CONTENT_CLASS : PAGE_CONTENT_CLASS;
}
