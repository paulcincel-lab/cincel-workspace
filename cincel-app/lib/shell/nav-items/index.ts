/**
 * Nav item registry (redesign FE §21.1): one file per domain, one import line
 * each; `buildNavModel` in `lib/ui/nav.ts` collects these. No phase edits a
 * registry: the owning phase replaces its item file's `resolve`.
 */
import type { NavItemSource } from "@/lib/ui/nav";

import { inicioNavItem } from "./inicio";
import { miEspacioNavItem } from "./mi-espacio";
import { tareasNavItem } from "./tareas";
import { calendarioNavItem } from "./calendario";
import { proyectosNavItem } from "./proyectos";
import { personasNavItem } from "./personas";
import { bibliotecaNavItem } from "./biblioteca";
import { asistenteNavItem } from "./asistente";
import { mejorasNavItem } from "./mejoras";
import { ajustesNavItem } from "./ajustes";

export const NAV_ITEM_SOURCES: readonly NavItemSource[] = [
  inicioNavItem,
  miEspacioNavItem,
  tareasNavItem,
  calendarioNavItem,
  proyectosNavItem,
  personasNavItem,
  bibliotecaNavItem,
  asistenteNavItem,
  mejorasNavItem,
  ajustesNavItem,
];
