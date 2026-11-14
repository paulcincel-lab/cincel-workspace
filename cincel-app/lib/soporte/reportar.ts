import type { TicketClientContext, TicketDraft, TicketKind } from "@/lib/types/soporte";
import { ticketDraftSchema } from "@/lib/validation/soporte";

/** Label of the main text field; it follows the kind. */
export const DESCRIPTION_LABEL: Record<TicketKind, string> = {
  error: "¿Qué pasó?",
  mejora: "¿Qué propones?",
  pregunta: "¿Qué quieres saber?",
};

export type DraftErrors = Partial<Record<"title" | "description" | "steps", string>>;

/** Inline validation of the form: the first message per field, empty when valid. */
export function validateDraft(draft: TicketDraft): DraftErrors {
  const parsed = ticketDraftSchema.safeParse({ ...draft, steps: draft.kind === "error" ? draft.steps : null });
  if (parsed.success) return {};
  const errors: DraftErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (key !== "title" && key !== "description" && key !== "steps") continue;
    if (errors[key]) continue;
    errors[key] =
      key === "title" && issue.code === "too_big"
        ? "El título no puede pasar de 120 caracteres."
        : key === "description" && issue.code === "too_big"
          ? "El texto es demasiado largo."
          : issue.message;
  }
  return errors;
}

/** What the browser tells about where the solicitud is filed from (the server adds version and time). */
export function captureClientContext(): TicketClientContext {
  const root = document.documentElement;
  return {
    path: `${window.location.pathname}${window.location.search}`.slice(0, 500) || "/",
    estilo: root.getAttribute("data-style") ?? "",
    theme: root.getAttribute("data-theme") ?? "",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent.slice(0, 500),
  };
}

/** The rows of the "Se enviará con" line, in the order the user reads them. */
export function contextRows(context: TicketClientContext, appVersion: string | null): { label: string; value: string }[] {
  return [
    { label: "Página", value: context.path },
    { label: "Estilo", value: context.estilo || "predeterminado" },
    { label: "Tema", value: context.theme === "dark" ? "oscuro" : context.theme === "light" ? "claro" : context.theme || "—" },
    { label: "Versión", value: appVersion ?? "desarrollo" },
    { label: "Pantalla", value: context.viewport },
  ];
}

/** Prefill of the "Reportar este error" button of an error page. */
export function errorPagePrefill(path: string, digest?: string): Partial<TicketDraft> {
  const lines = [`Página: ${path}`];
  if (digest) lines.push(`Código del error: ${digest}`);
  return { kind: "error", title: `Error al cargar ${path}`.slice(0, 120), description: lines.join("\n"), steps: null };
}
