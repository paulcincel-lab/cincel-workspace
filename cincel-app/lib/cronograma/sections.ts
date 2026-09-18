/**
 * Fixed sección order and color palette, ported from the reference Madrid 22
 * dashboard. Unknown secciones (other projects) fall back to the neutral
 * token and sort after known ones — see sortSections below.
 */
export const SECTION_ORDER: string[] = [
  "Preliminares",
  "Albañilerías",
  "Instalaciones eléctricas",
  "Suministro apagadores y contactos",
  "Instalaciones hidrosanitarias",
  "Instalación de gas",
  "Acabados",
  "Carpinterías",
  "Cancelerías y herrerías",
];

export const SECTION_COLOR: Record<string, string> = {
  Preliminares: "bg-orange-500",
  Albañilerías: "bg-violet-500",
  "Instalaciones eléctricas": "bg-yellow-400",
  "Suministro apagadores y contactos": "bg-fuchsia-500",
  "Instalaciones hidrosanitarias": "bg-cyan-500",
  "Instalación de gas": "bg-red-500",
  Acabados: "bg-blue-500",
  Carpinterías: "bg-green-500",
  "Cancelerías y herrerías": "bg-red-500",
};

export const UNKNOWN_SECTION_COLOR = "bg-muted-foreground";

export function sectionColor(seccion: string): string {
  return SECTION_COLOR[seccion] ?? UNKNOWN_SECTION_COLOR;
}

/** Known sections first (canonical order), unknown sections after (alphabetical). */
export function sortSections(secciones: string[]): string[] {
  const known = SECTION_ORDER.filter((s) => secciones.includes(s));
  const unknown = secciones.filter((s) => !SECTION_ORDER.includes(s)).sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}
