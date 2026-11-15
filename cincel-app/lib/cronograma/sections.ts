/**
 * Fixed sección order and colors. Colors are the theme chart slots (cycling
 * through chart-1..5), so they follow the active theme. Unknown secciones (other projects) fall back to the neutral
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
  Preliminares: "bg-chart-1",
  Albañilerías: "bg-chart-2",
  "Instalaciones eléctricas": "bg-chart-3",
  "Suministro apagadores y contactos": "bg-chart-4",
  "Instalaciones hidrosanitarias": "bg-chart-5",
  "Instalación de gas": "bg-chart-1",
  Acabados: "bg-chart-2",
  Carpinterías: "bg-chart-3",
  "Cancelerías y herrerías": "bg-chart-4",
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
