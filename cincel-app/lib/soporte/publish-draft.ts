/**
 * The editable draft shown in "Publicar en GitHub…" (#1116): template body
 * (Problema, Propuesta, Contexto técnico) with the redaction already applied.
 * Pure and client-safe.
 */
import { redactForGithub, type RedactionContext } from "@/lib/soporte/redact";
import { AREA_LABEL, KIND_LABEL, type TicketArea, type TicketContext, type TicketKind } from "@/lib/types/soporte";

/** Labels every published solicitud carries; the kind label follows. */
export const RFC_LABEL = "rfc";
export const PUBLISH_CHECKLIST_TEXT = "Sin nombres de clientes, personas, correos ni datos internos";

export type PublishDraftSource = {
  kind: TicketKind;
  title: string;
  description: string;
  steps: string | null;
  area: TicketArea;
  context: TicketContext;
};

export type PublishDraft = { title: string; body: string; labels: string[]; redacted: boolean };

/** `rfc` plus the kind of the solicitud. */
export function draftLabels(kind: TicketKind): string[] {
  return [RFC_LABEL, kind];
}

function technicalContext(source: PublishDraftSource): string {
  // Paths carry ids of records: keep the shape only.
  const path = source.context.path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
  const rows: [string, string | null][] = [
    ["Tipo", KIND_LABEL[source.kind]],
    ["Área", AREA_LABEL[source.area] ?? source.area],
    ["Ruta", path || null],
    ["Estilo", source.context.estilo || null],
    ["Tema", source.context.theme || null],
    ["Pantalla", source.context.viewport || null],
    ["Versión", source.context.appVersion || null],
  ];
  return rows
    .filter((row): row is [string, string] => row[1] !== null)
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");
}

/** The draft body is redacted as a whole, so nothing in the template slips through. */
export function buildPublishDraft(source: PublishDraftSource, redaction: RedactionContext): PublishDraft {
  const problem = [source.description.trim(), source.steps?.trim() ? `Pasos para reproducirlo:\n${source.steps.trim()}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const proposal = source.kind === "mejora" ? "Describe aquí la mejora propuesta." : "Describe aquí cómo se resolvería.";
  const raw = ["## Problema", problem, "## Propuesta", proposal, "## Contexto técnico", technicalContext(source)].join("\n\n");

  const body = redactForGithub(raw, redaction);
  const title = redactForGithub(source.title.trim(), redaction);
  return { title: title.text, body: body.text, labels: draftLabels(source.kind), redacted: body.changed || title.changed };
}

/** Inline copy for the errors of publishing; anything else falls back to the generic copy. */
export function publishErrorText(code: string): string | null {
  switch (code) {
    case "GITHUB_NOT_CONFIGURED":
      return "GitHub no está configurado.";
    case "GITHUB_ERROR":
      return "GitHub no aceptó la publicación. No se guardó nada; intenta de nuevo.";
    case "ALREADY_PUBLISHED":
      return "Esta solicitud ya se publicó en GitHub.";
    case "CONFIRM_REQUIRED":
      return "Marca la casilla de confirmación antes de publicar.";
    case "RATE_LIMITED":
      return "Publicaste varias solicitudes seguidas. Intenta de nuevo en un rato.";
    case "DISABLED":
      return "Publicar en GitHub no está disponible todavía.";
    default:
      return null;
  }
}
