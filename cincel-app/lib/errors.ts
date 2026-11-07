/**
 * Error thrown when a repository / Server Action data operation fails.
 *
 * The app must not silently fall back to localStorage on a write failure —
 * that would diverge Postgres from local state. Catch this at the call site,
 * surface it, and stop.
 */
export class RepositoryError extends Error {
  readonly operation: string;
  readonly detail: string;

  constructor(operation: string, detail: string) {
    super(`[Cincel] ${operation}: ${detail}`);
    this.name = "RepositoryError";
    this.operation = operation;
    this.detail = detail;
  }
}

/** Log a RepositoryError visibly. Call from a repository/action catch block. */
export function reportRepositoryError(error: RepositoryError): void {
  console.error(
    `%c⛔ Cincel – data operation failed`,
    "background:#dc2626;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px;"
  );
  console.error(`  Operation : ${error.operation}`);
  console.error(`  Detail    : ${error.detail}`);
}

// ── Action error copy (project flow, FE §9) ────────────────────────────────

/** What the failing action was about, to pick the right copy for shared codes. */
export type ActionErrorContext = {
  /** `NAME_TAKEN`: which kind of name collided. */
  entity?: "project" | "phase" | "position" | "space" | "template";
  /** `INVALID`: "status" for the "Cuenta como completada" rule; anything else is generic. */
  invalid?: "status" | "other";
  /** `TOUCHED`: the tramo name. */
  tramoName?: string;
  /** `NAME_TAKEN` on a template: the fase name. */
  phaseName?: string;
};

const NAME_TAKEN_COPY: Record<NonNullable<ActionErrorContext["entity"]>, (ctx: ActionErrorContext) => string> = {
  project: () => "Ya existe un proyecto con ese nombre.",
  phase: () => "Ya existe una fase con ese nombre.",
  position: () => "Ya existe un puesto con ese nombre.",
  space: () => "Ya existe un espacio con ese nombre.",
  template: (ctx) => `Ya existe una tarea de plantilla con ese nombre en ${ctx.phaseName ?? "esta fase"}.`,
};

/** The leading `CODE` of an action error (`Error("CODE")` or `Error("CODE: detail")`), or "". */
export function actionErrorCode(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "";
  const match = /^([A-Z_]+)(?::|$)/.exec(raw.trim());
  return match ? match[1] : "";
}

/** Spanish copy for a project-flow action error (FE §9). Unknown errors get the generic copy. */
export function actionErrorText(err: unknown, context: ActionErrorContext = {}): string {
  switch (actionErrorCode(err)) {
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta acción.";
    case "NOT_FOUND":
      return "Ya no existe. Recarga la página.";
    case "EMPTY":
      return "Escribe un nombre.";
    case "NAME_TAKEN":
      return NAME_TAKEN_COPY[context.entity ?? "project"](context);
    case "PHASE_MISMATCH":
      return "Esa fase no pertenece al tramo de la tarea.";
    case "SPACE_MISMATCH":
      return "Ese espacio es de otro proyecto.";
    case "ADMIN_TASK":
      return "Las tareas de administración no tienen fase ni espacio.";
    case "NO_PHASES":
      return "Elige al menos una fase.";
    case "NOT_STARTED":
      return "Ese tramo aún no se inicia en el proyecto.";
    case "TOUCHED":
      return `No se puede deshacer: ya se editó una de las tareas creadas o ${context.tramoName ?? "el tramo"} se inició de nuevo después.`;
    case "IN_USE":
      return "Este puesto se asigna desde un grupo de Google. Quita el grupo en Configuración → Google primero.";
    case "INVALID":
      return context.invalid === "status"
        ? "Solo un estatus que cierra la tarea puede contar como completado."
        : "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";
    case "STATUS_NOT_FOUND":
      return "Uno de los estatus elegidos ya no existe. Elige otro y vuelve a guardar.";
    case "NOT_IMPORTED":
      return "Este proyecto no viene de una importación de monday.";
    case "EXPORT_MISSING":
      return "Ya no están los archivos de la exportación de monday de este proyecto. Vuelve a exportar el tablero para reacomodarlo.";
    case "ASSIGNEE_NOT_ADMIN":
      return "Las tareas de administración solo se asignan a administradores.";
    default:
      return "No se pudo completar la acción. Intenta de nuevo.";
  }
}
