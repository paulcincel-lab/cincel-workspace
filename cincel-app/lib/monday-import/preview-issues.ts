/**
 * Vista previa problems of the monday import wizard (#679) in Spanish. The plan (scripts/monday/plan.ts) reports its
 * issues in English for the CLI; here each one becomes a Spanish sentence, with the board and item it is about, and
 * the step of the wizard where it gets fixed. Never shows ids or server paths. Pure and client-safe.
 */
import type { PlanIssueCode } from "@/scripts/monday/plan";
import type { MondayImportStep } from "@/lib/types/monday-import";

/** Where a problem gets fixed: the wizard step, opened on the issue's board when it has one. */
export const ISSUE_FIX_STEP: Record<PlanIssueCode, MondayImportStep> = {
  MAPPING_INVALID: "equivalencias",
  CLIENT_UNRESOLVED: "equivalencias",
  CONTACT_NAME_TAKEN: "equivalencias",
  PROJECT_NAME_TAKEN: "equivalencias",
  PROJECT_CODE_TAKEN: "equivalencias",
  STATUS_UNMAPPED: "equivalencias",
  STATUS_DEFAULTED: "equivalencias",
  TEMPLATE_COLLISION: "equivalencias",
  TEMPLATE_INVALID: "equivalencias",
  PROVIDER_SUBTYPE_MISSING: "equivalencias",
  SCHEDULE_EXISTS: "equivalencias",
  DRIVE_NOT_CONFIGURED: "opciones",
  PERSON_UNMATCHED: "personas",
  RELATION_MISSING: "equivalencias",
  DATES_MISSING: "equivalencias",
  FILE_MISSING: "opciones",
  AREA_NAME_TAKEN: "equivalencias",
  AREA_UNMAPPED: "equivalencias",
};

/** The first "quoted" value of a plan message (a monday name, label or code), or null. */
function quoted(message: string): string | null {
  return /"([^"]+)"/.exec(message)?.[1] ?? null;
}

/** «name» for a sentence, or the fallback when the message has no name. */
function named(value: string | null, fallback: string): string {
  return value ? `«${value}»` : fallback;
}

/** The Spanish sentence for one plan issue; `message` is the plan's English text, read only for the names in it. */
export function issueText(code: PlanIssueCode, message: string): string {
  const name = quoted(message);
  switch (code) {
    case "CLIENT_UNRESOLVED":
      return name
        ? `El proyecto «${name}» no tiene cliente. Elige uno en Cliente.`
        : "El cliente elegido no existe o no es un cliente del Directorio. Elige otro en Cliente.";
    case "CONTACT_NAME_TAKEN":
      return /exists already/.test(message)
        ? `Ya existe un contacto llamado ${named(name, "igual")}. Elige ese contacto o cambia el nombre en monday.`
        : `Varios contactos nuevos se llaman ${named(name, "igual")}. Elige un contacto existente o cambia los nombres en monday.`;
    case "PROJECT_NAME_TAKEN":
      return /already has/.test(message)
        ? `El cliente ya tiene un proyecto llamado ${named(name, "igual")}. Ponle otro nombre en Nombres y códigos de proyecto.`
        : `Varios proyectos nuevos del mismo cliente se llaman ${named(name, "igual")}. Ponles otro nombre en Nombres y códigos de proyecto.`;
    case "PROJECT_CODE_TAKEN":
      return /existing project/.test(message)
        ? `Otro proyecto ya usa el código ${named(name, "elegido")}. Cámbialo en Nombres y códigos de proyecto.`
        : `El código ${named(name, "elegido")} se repite en varios proyectos nuevos. Cámbialo en Nombres y códigos de proyecto.`;
    case "STATUS_UNMAPPED":
      return name
        ? `La etiqueta de estatus «${name}» no tiene equivalente. Elígelo en Estatus.`
        : "Un estatus personalizado elegido ya no existe. Elige otro en Estatus.";
    case "STATUS_DEFAULTED":
      return `La etiqueta de estatus ${named(name, "sin nombre")} no tiene equivalente; sus tareas quedan como Pendiente. Revísala en Estatus.`;
    case "TEMPLATE_COLLISION":
      return `${named(name, "Un elemento")} coincide con una plantilla que ya se usa en su proyecto. Quita una en Plantillas del workflow.`;
    case "TEMPLATE_INVALID":
      return "La plantilla elegida no existe o no es del departamento del tablero. Revisa Plantillas del workflow.";
    case "PROVIDER_SUBTYPE_MISSING":
      return "Elige el tipo de proveedor de los contactos.";
    case "SCHEDULE_EXISTS":
      return "Un proyecto ya tiene un cronograma que no creó esta importación. Apaga Crear cronograma en este tablero.";
    case "DRIVE_NOT_CONFIGURED":
      return "Google Drive no está listo para subir los archivos. Apaga los archivos en Opciones.";
    case "MAPPING_INVALID":
      if (message.startsWith("workflowId")) return "El workflow elegido ya no existe. Elige otro.";
      if (message.startsWith("areaId")) return "El departamento elegido ya no existe. Elige otro.";
      if (message.startsWith("taskAreas"))
        return "Un área o workflow elegido en Área y workflow de las tareas ya no existe o no va con esa área. Elige otro.";
      if (message.startsWith("contactMatches")) return "Un contacto elegido no existe o no es del tipo del tablero. Elige otro.";
      return "Falta una equivalencia o no es válida. Revisa este tablero.";
    case "PERSON_UNMATCHED": {
      const person = /\(([^)]+)\) has no staff match/.exec(message)?.[1];
      return `${person && person !== "?" ? `«${person}»` : "Una persona de monday"} no tiene equivalente en el equipo; sus tareas quedan sin responsable. Elígela o usa Crear integrante en Personas.`;
    }
    case "RELATION_MISSING":
      return "Un elemento vinculado no está en la exportación; ese vínculo no se importa.";
    case "DATES_MISSING":
      return `${named(name, "Un elemento")} no tiene línea de tiempo; no entra al cronograma.`;
    case "FILE_MISSING":
      return `El archivo ${named(name, "de un elemento")} no se descargó; no se importa. Exporta otra vez o apaga los archivos en Opciones.`;
    case "AREA_NAME_TAKEN":
      return `Ya existe un área llamada ${named(name, "igual")}. Elígela en Área y workflow de las tareas en vez de crearla.`;
    case "AREA_UNMAPPED":
      return `El valor ${named(name, "de un elemento")} no tiene área ni workflow; sus tareas quedan con el workflow del tablero. Elígelos en Área y workflow de las tareas.`;
  }
}

/** The monday user id of a PERSON_UNMATCHED issue (#689), so the Vista previa links to that row of Personas. */
export function issuePersonId(code: PlanIssueCode, message: string): string | null {
  if (code !== "PERSON_UNMATCHED") return null;
  return /monday user (\S+) \(/.exec(message)?.[1] ?? null;
}
