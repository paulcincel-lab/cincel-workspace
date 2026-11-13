/**
 * Vista previa problems of the monday import wizard (#679) in Spanish. The plan (scripts/monday/plan.ts) reports its
 * issues in English for the CLI; here each one becomes a Spanish sentence, with the board and item it is about, and
 * the step of the wizard where it gets fixed. Never shows ids or server paths. Pure and client-safe.
 */
import type { PlanIssueCode } from "@/scripts/monday/plan";
import type { MondayImportStep, MondayPreviewIssue } from "@/lib/types/monday-import";

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
  ETAPA_MISSING: "equivalencias",
  PHASE_UNRESOLVED: "equivalencias",
  CLIENT_MISSING: "equivalencias",
  ADMIN_ASSIGNEE_CLEARED: "equivalencias",
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
      return "El cliente elegido no existe o no es un cliente del Directorio. Elige otro en Cliente.";
    case "CONTACT_NAME_TAKEN":
      return /exists already/.test(message)
        ? `Ya existe un contacto llamado ${named(name, "igual")}. Elige ese contacto o cambia el nombre en monday.`
        : `Varios contactos nuevos se llaman ${named(name, "igual")}. Elige un contacto existente o cambia los nombres en monday.`;
    case "PROJECT_NAME_TAKEN":
      return /exists already|already has/.test(message)
        ? `Ya hay un proyecto activo llamado ${named(name, "igual")}. Ponle otro nombre en Nombres y códigos de proyecto.`
        : `Varios proyectos nuevos se llaman ${named(name, "igual")}. Ponles otro nombre en Nombres y códigos de proyecto.`;
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
      return `${named(name, "Un elemento")} coincide con una plantilla que ya se usa en su proyecto. Quita una en Tareas de plantilla.`;
    case "TEMPLATE_INVALID":
      return "La plantilla elegida no existe o no es de la etapa de la tarea. Revisa Tareas de plantilla.";
    case "PROVIDER_SUBTYPE_MISSING":
      return "Elige el tipo de proveedor de los contactos.";
    case "SCHEDULE_EXISTS":
      return "Un proyecto ya tiene un cronograma que no creó esta importación. Apaga Crear cronograma en este tablero.";
    case "DRIVE_NOT_CONFIGURED":
      return "Google Drive no está listo para subir los archivos. Apaga los archivos en Opciones.";
    case "MAPPING_INVALID":
      if (message.startsWith("workflowId")) return "La etapa elegida ya no existe. Elige otra en Etapa del tablero.";
      if (message.startsWith("groupTargets"))
        return "La etapa o la fase elegida para un grupo ya no existe. Elige otra en Grupos y etapa.";
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
    case "ETAPA_MISSING":
      return "Elige una etapa: hay tareas de este tablero sin etapa. Elige la Etapa del tablero o una etapa para su grupo.";
    case "PHASE_UNRESOLVED":
      return `${named(name, "Una tarea")} no coincide con ninguna fase; se importa sin fase para revisarla.`;
    case "CLIENT_MISSING":
      return `El proyecto ${named(name, "nuevo")} no tiene cliente; se crea con la tarea de administración «Asignar cliente y origen».`;
    case "ADMIN_ASSIGNEE_CLEARED":
      return "Una tarea de administración tenía responsables que no son administradores; se importa sin ellos.";
  }
}

/** Accordion titles of the grouped warnings in Vista previa (FE §4.6 item 9); `{n}` is the count. */
export const WARNING_GROUP_TITLES: Partial<Record<PlanIssueCode, (n: number) => string>> = {
  PERSON_UNMATCHED: (n) => `Personas sin equivalente (${n})`,
  STATUS_DEFAULTED: (n) => `Estatus sin equivalente (${n})`,
  DATES_MISSING: (n) => `Elementos sin línea de tiempo (${n})`,
  PHASE_UNRESOLVED: (n) => `Tareas sin fase (${n})`,
  CLIENT_MISSING: (n) => `Proyectos sin cliente (${n})`,
  ADMIN_ASSIGNEE_CLEARED: (n) => `Tareas de administración sin responsable (${n})`,
};

export interface PreviewWarningGroup {
  code: PlanIssueCode;
  /** The accordion title: the code's title with its count, else the first issue's text. */
  title: string;
  issues: MondayPreviewIssue[];
}

/**
 * Vista previa's warnings grouped by issue code, in order of first appearance (blocking issues stay a list and are
 * left out). Codes without a title are titled with their issue text.
 */
export function groupPreviewWarnings(issues: readonly MondayPreviewIssue[]): PreviewWarningGroup[] {
  const groups = new Map<PlanIssueCode, MondayPreviewIssue[]>();
  for (const issue of issues) {
    if (issue.blocking) continue;
    groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);
  }
  return [...groups].map(([code, list]) => ({
    code,
    title: WARNING_GROUP_TITLES[code]?.(list.length) ?? list[0].message,
    issues: list,
  }));
}

/** The monday user id of a PERSON_UNMATCHED issue (#689), so the Vista previa links to that row of Personas. */
export function issuePersonId(code: PlanIssueCode, message: string): string | null {
  if (code !== "PERSON_UNMATCHED") return null;
  return /monday user (\S+) \(/.exec(message)?.[1] ?? null;
}

/** The monday user name of a PERSON_UNMATCHED issue, or null when the plan didn't know it. */
export function issuePersonName(code: PlanIssueCode, message: string): string | null {
  if (code !== "PERSON_UNMATCHED") return null;
  const name = /monday user \S+ \((.+)\) has no staff match/.exec(message)?.[1];
  return name && name !== "?" ? name : null;
}
