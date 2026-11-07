/**
 * Assistant tool registry (redesign BE §10.1): one import per domain file
 * (`lib/assistant/tools/<domain>.ts`). `buildAssistantTools` in
 * `lib/assistant/tools.ts` filters these by capability and availability.
 */
import type { DefinedTool } from "@/lib/assistant/define-tool";

import { tools as agenda } from "./agenda";
import { tools as arquitectura } from "./arquitectura";
import { tools as consulta } from "./consulta";
import { tools as correo } from "./correo";
import { tools as miEspacio } from "./mi-espacio";
import { tools as notificaciones } from "./notificaciones";
import { tools as personas } from "./personas";
import { tools as tareas } from "./tareas";
import { tools as widgets } from "./widgets";

export const DEFINED_TOOLS: readonly DefinedTool[] = [
  ...consulta,
  ...tareas,
  ...agenda,
  ...notificaciones,
  ...correo,
  ...miEspacio,
  ...personas,
  ...arquitectura,
  ...widgets,
];
