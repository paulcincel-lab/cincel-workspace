/**
 * Spanish copy for the errors the Etapas y fases actions throw
 * (`"CODE"` or `"CODE: detail"`, frontend spec §9).
 */
export type EtapasErrorContext =
  | { kind: "phase"; workflowName: string }
  | { kind: "template"; phaseName: string }
  | { kind: "other" };

export function errorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message.split(":")[0]?.trim() ?? "";
}

export function etapasErrorText(err: unknown, context: EtapasErrorContext = { kind: "other" }): string {
  switch (errorCode(err)) {
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta acción.";
    case "NOT_FOUND":
      return "Ya no existe. Recarga la página.";
    case "EMPTY":
      return "Escribe un nombre.";
    case "NAME_TAKEN":
      if (context.kind === "phase") return `Ya existe una fase con ese nombre en ${context.workflowName}.`;
      if (context.kind === "template") return `Ya existe una tarea de plantilla con ese nombre en ${context.phaseName}.`;
      return "Ya existe un registro con ese nombre.";
    case "PHASE_MISMATCH":
      return "Esa fase no pertenece a la etapa de la tarea.";
    case "INVALID":
      return "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";
    default:
      return "No se pudo completar la acción. Intenta de nuevo.";
  }
}
