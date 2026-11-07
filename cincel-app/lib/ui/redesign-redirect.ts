/**
 * Flag-aware redirect for the redesign's new-only routes (FE §2.3; Phase 2
 * implements it). A new-only page (`/inicio`, `/mi-espacio`, `/tareas`,
 * `/personas*`, `/biblioteca*`, `/ajustes/*`) calls it first; with the flag
 * off it redirects to the legacy equivalent (e.g. `/inicio` → `/dashboard`).
 *
 * Contract stub: no-op.
 */
export async function redirectIfRedesignOff(
  pathname: string,
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<void> {
  void pathname;
  void searchParams;
}
