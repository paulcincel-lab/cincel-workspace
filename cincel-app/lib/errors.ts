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

// ── Action error copy (project flow + redesign, FE §9 / BE §9.10) ──────────

/**
 * Where the failing call came from, for codes whose copy depends on it
 * (`INVALID` in search, `RATE_LIMITED` in Gmail sync, `DISABLED` for Cutto and
 * the redesign opt-in). `"redesign"` selects the opt-in `DISABLED` copy.
 */
export type ErrorContextName = "search" | "cutto" | "photo" | "gmail" | "vacations" | "redesign";

/** The one context argument of `actionErrorText`: a redesign context name or Project Flow's keys. */
export type ErrorContext = ErrorContextName | ActionErrorContext;

/** What the failing action was about, to pick the right copy for shared codes. */
export type ActionErrorContext = {
  /** Redesign context (same as passing the name directly). */
  area?: ErrorContextName;
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

/** Error code for an HTTP status (photo route and other route handlers). */
const HTTP_STATUS_CODES: Record<number, string> = {
  400: "INVALID",
  401: "FORBIDDEN",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  413: "TOO_LARGE",
  415: "INVALID_TYPE",
  422: "INVALID",
  429: "RATE_LIMITED",
  501: "NOT_IMPLEMENTED",
};

/**
 * The leading `CODE` of an action error, or "". Accepts `Error("CODE")`,
 * `Error("CODE: detail")`, a `"CODE: detail"` string, `{ error: "CODE" }`, an
 * HTTP status number, or a response-like `{ status }`.
 */
export function actionErrorCode(err: unknown): string {
  if (typeof err === "number") return HTTP_STATUS_CODES[err] ?? "";
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "";
  const match = /^([A-Z_]+)(?::|$)/.exec(raw.trim());
  if (match) return match[1];
  if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
    return HTTP_STATUS_CODES[(err as { status: number }).status] ?? "";
  }
  return "";
}

/**
 * Spanish copy for an action error (FE §9). `context` is a redesign context
 * name (`"search"`, `"cutto"`, `"photo"`, `"gmail"`, `"vacations"`,
 * `"redesign"`) or Project Flow's keys. Unknown errors get the generic copy.
 */
export function actionErrorText(err: unknown, context: ErrorContext = {}): string {
  const ctx: ActionErrorContext = typeof context === "string" ? { area: context } : context;
  return codeText(actionErrorCode(err), ctx);
}

function codeText(code: string, context: ActionErrorContext): string {
  switch (code) {
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
      if (context.invalid === "status") return "Solo un estatus que cierra la tarea puede contar como completado.";
      if (context.area === "search") return "Escribe al menos 2 letras.";
      return "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";
    case "STATUS_NOT_FOUND":
      return "Uno de los estatus elegidos ya no existe. Elige otro y vuelve a guardar.";
    case "NOT_IMPORTED":
      return "Este proyecto no viene de una importación de monday.";
    case "EXPORT_MISSING":
      return "Ya no están los archivos de la exportación de monday de este proyecto. Vuelve a exportar el tablero para reacomodarlo.";
    case "ASSIGNEE_NOT_ADMIN":
      return "Las tareas de administración solo se asignan a administradores.";
    case "OVERRIDE_DISABLED":
      return "La organización fijó el tema y el estilo. Pídele a un administrador que lo cambie.";
    case "LOW_CONTRAST":
      return "Algunos textos no se leerían bien (contraste menor a 4.5:1). Ajusta los colores marcados.";
    case "INVALID_TYPE":
      return "Ese archivo no es una imagen. Usa JPG, PNG o WebP.";
    case "PAST_TIME":
      return "Esa fecha ya pasó. Elige una hora futura.";
    case "NOT_CONNECTED":
      return "Gmail no está conectado. Conéctalo en Ajustes › Gmail, calendario y Cutto.";
    case "SCOPE_MISSING":
      return "Falta dar permiso para leer el correo. Vuelve a conectar Gmail.";
    case "CONFIRM_REQUIRED":
      return "Confirma el envío antes de continuar.";
    case "EXPIRED":
      return "Esta confirmación venció. Vuelve a intentarlo.";
    case "ALREADY_ON":
      return "Ya registraste tu entrada hoy.";
    case "NOT_ON":
      return "Tu jornada no está en curso.";
    case "DISABLED":
      if (context.area === "redesign") return "El nuevo diseño no está disponible por ahora.";
      if (context.area === "cutto") return "La integración con Cutto aún no está disponible. Usa el enlace para abrir Cutto.";
      return "Esta función está desactivada.";
    case "OVERLAP":
      return "Ya tienes una solicitud en esas fechas.";
    case "NOT_IMPLEMENTED":
      return "Esta función todavía no está disponible.";
    case "RATE_LIMITED":
      return context.area === "gmail"
        ? "Se sincronizó hace un momento. Intenta de nuevo en unos minutos."
        : "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.";
    case "STARTED":
      return "Esa solicitud ya empezó; ya no se puede cancelar. Habla con quien la aprobó.";
    case "TOO_LARGE":
      return "La imagen pesa más de 2 MB. Elige una más ligera.";
    default:
      return "No se pudo completar la acción. Intenta de nuevo.";
  }
}
