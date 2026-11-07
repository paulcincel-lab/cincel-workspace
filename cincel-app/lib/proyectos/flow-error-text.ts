import { flowErrorCode } from "@/lib/project-flow/errors";

/**
 * Spanish copy for the ficha's tramo and espacio action errors (FE §9).
 * `subject` words the `NAME_TAKEN` message ("un espacio").
 */
export function fichaFlowErrorText(err: unknown, subject = "un espacio"): string {
  switch (flowErrorCode(err)) {
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta acción.";
    case "NOT_FOUND":
      return "Ya no existe. Recarga la página.";
    case "EMPTY":
      return "Escribe un nombre.";
    case "NAME_TAKEN":
      return `Ya existe ${subject} con ese nombre.`;
    case "NOT_STARTED":
      return "Ese tramo aún no se inicia en el proyecto.";
    case "INVALID":
      return "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo.";
    default:
      return "No se pudo completar la acción. Intenta de nuevo.";
  }
}
