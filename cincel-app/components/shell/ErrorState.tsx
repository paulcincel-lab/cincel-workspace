/**
 * Error state (redesign FE §4.2): "No se pudo cargar esta página." + "Reintentar".
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type ErrorStateProps = { title?: string; description?: string; onRetry?(): void; code?: string };

export function ErrorState(props: ErrorStateProps) {
  void props;
  return null;
}
