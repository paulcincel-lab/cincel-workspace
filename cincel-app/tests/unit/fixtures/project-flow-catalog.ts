/**
 * Frozen copies of the project flow seed catalog (BE §5.1, §5.2) and of the
 * old TS templates it replaced (presale, diseño and operativas, now deleted).
 * The drift guard compares `DEFAULT_CATALOG` and 0024 against these.
 */

export type ExpectedPhase = { key: string; name: string; titles: string[] };
export type ExpectedEtapa = { workflowKey: string; phases: ExpectedPhase[] };

/** BE §5.1 fases and §5.2 template titles, in seed order. */
export const EXPECTED_CATALOG: ExpectedEtapa[] = [
  {
    workflowKey: "presale",
    phases: [
      { key: "inicial", name: "Inicial", titles: ['Presentación "Quiénes somos"'] },
      {
        key: "presentacion",
        name: "Presentación",
        titles: [
          "Reporte Estado Actual",
          "Imágenes de Referencia",
          "Plano preliminar",
          "Primeras Visualizaciones",
          "Rango de Precios",
          "Presupuesto Diseño",
        ],
      },
      { key: "con_cliente", name: "Con Cliente", titles: ["Presentar a cliente"] },
      { key: "minutas", name: "Minutas", titles: ["Minuta"] },
      { key: "cobro", name: "Cobro", titles: ["Cobrar Inicio de proyecto"] },
    ],
  },
  {
    workflowKey: "diseno",
    phases: [
      {
        key: "anteproyecto",
        name: "Anteproyecto",
        titles: ["Levantamiento", "Concepto", "Plano de distribución", "Volumetría"],
      },
      {
        key: "proyecto_arquitectonico",
        name: "Proyecto Arquitectónico",
        titles: ["Planos Arquitectónicos", "Fachadas y alzados", "Mood Board", "Renders"],
      },
      {
        key: "ejecutivo",
        name: "Ejecutivo",
        titles: [
          "Fachadas y alzados",
          "Planos de Demolición Desmantelamiento",
          "Planos de Albañilerías",
          "Planos Eléctricos",
          "Planos Iluminación",
          "Planos Hidráulicos",
          "Planos Sanitarios",
          "Planos Acabados",
          "Planos de Carpintería",
          "Plano de Mobiliario",
          "Plano de Cancelerías",
          "Planos de Herrerías",
          "Memoria Descriptiva",
          "Detalles y Especificaciones Técnicas",
        ],
      },
      { key: "proyecto_estructural", name: "Proyecto Estructural", titles: ["Memoria de Cálculo", "Cálculos Simulaciones"] },
      {
        key: "proyecto_sustentable",
        name: "Proyecto Sustentable",
        titles: ["Captación Agua Pluvial", "Tratamiento aguas", "Fotovoltaico"],
      },
      { key: "paisajismo", name: "Paisajismo", titles: ["Paleta Vegetal"] },
      { key: "minutas", name: "Minutas", titles: ["Minutas"] },
    ],
  },
  {
    workflowKey: "construccion",
    phases: [
      {
        key: "residencia",
        name: "Residencia",
        titles: [
          "Bitácoras y Minutas",
          "Reporte de Avance",
          "Revisión de planos",
          "Supervisión de trabajos",
          "Cumplimiento Seguridad",
          "Cumplimiento Orden y Limpieza",
          "Atención a calidad y detalles finos",
          "Garantías",
          "Manual de Mantenimiento",
          "Cierre de obra (Firma de actas)",
        ],
      },
      { key: "postventa", name: "Postventa", titles: ["Mantenimientos", "Garantías"] },
    ],
  },
];

export type LegacyTemplate = { phase: string; description: string };

/**
 * The TS templates as they were before the project flow (frozen 2026-11-06),
 * keyed by `workflows.key`: presale.ts → presale, diseno.ts → diseno,
 * operativas.ts → construccion.
 */
export const LEGACY_TS_TEMPLATES: Record<string, LegacyTemplate[]> = {
  presale: [
    { phase: "Inicial", description: 'Presentación "Quienes somos"' },
    { phase: "Presentación", description: "Resporte Estado Actual" },
    { phase: "Presentación", description: "Imagenes de Referencia" },
    { phase: "Presentación", description: "Plano preliminar" },
    { phase: "Presentación", description: "Primeras Visualizaciones" },
    { phase: "Presentación", description: "Rango de Precios" },
    { phase: "Presentación", description: "Presupuesto Diseño" },
    { phase: "Con Cliente", description: "Presentar a cliente" },
    { phase: "Minutas", description: "Minuta" },
    { phase: "Cobro", description: "Cobrar Inicio de proyecto" },
  ],
  diseno: [
    { phase: "Anteproyecto", description: "Levantamiento" },
    { phase: "Anteproyecto", description: "Concepto" },
    { phase: "Anteproyecto", description: "Plano de distribicion" },
    { phase: "Anteproyecto", description: "Volumetria" },
    { phase: "Proyecto Arquitectonico", description: "Planos Arquitectonicos" },
    { phase: "Proyecto Arquitectonico", description: "Fachadas y alzados" },
    { phase: "Proyecto Arquitectonico", description: "Mood Board" },
    { phase: "Proyecto Arquitectonico", description: "Renders" },
    { phase: "Ejecutivo", description: "Fachadas y alzados" },
    { phase: "Ejecutivo", description: "Planos de Demolicion Desmantelamiento" },
    { phase: "Ejecutivo", description: "Planos de Albanilerias" },
    { phase: "Ejecutivo", description: "Planos Electricos" },
    { phase: "Ejecutivo", description: "Planos Iluminacion" },
    { phase: "Ejecutivo", description: "Planos Hidraulicos" },
    { phase: "Ejecutivo", description: "Planos Sanitarios" },
    { phase: "Ejecutivo", description: "Planos Acabados" },
    { phase: "Ejecutivo", description: "Planos de Carpinteria" },
    { phase: "Ejecutivo", description: "Plano de Mobiliario" },
    { phase: "Ejecutivo", description: "Plano de Cancelerias" },
    { phase: "Ejecutivo", description: "Planos de Herrerias" },
    { phase: "Ejecutivo", description: "Memoria Descriptiva" },
    { phase: "Ejecutivo", description: "Detalles y Especificaciones Tecnicas" },
    { phase: "Proyecto Estructural", description: "Memoria de Calculo" },
    { phase: "Proyecto Estructural", description: "Calculos Simulaciones" },
    { phase: "Proyecto Sustentable", description: "Captacion Agua Pluvial" },
    { phase: "Proyecto Sustentable", description: "Tratamiento aguas" },
    { phase: "Proyecto Sustentable", description: "Fotovoltaico" },
    { phase: "Paisajismo", description: "Paleta Vegetal" },
    { phase: "Minutas", description: "Minutas" },
  ],
  construccion: [
    { phase: "Residencia", description: "Bitacoras y Minutas" },
    { phase: "Residencia", description: "Reporte de Avance" },
    { phase: "Residencia", description: "Revision de planos" },
    { phase: "Residencia", description: "Supervicion de trabajos" },
    { phase: "Residencia", description: "Cumplimiento Seguridad" },
    { phase: "Residencia", description: "Cumplimiento Orden y Limpieza" },
    { phase: "Residencia", description: "Atencion a calidad y detalles finos" },
    { phase: "Residencia", description: "Garantias" },
    { phase: "Residencia", description: "Manual de Mantenimiento" },
    { phase: "Residencia", description: "Cierre de obra (Firma de actas)" },
    { phase: "Postventa", description: "Mantenimientos" },
    { phase: "Postventa", description: "Garantias" },
  ],
};

/** Accent-insensitive key, the same rule as core.flow_name_key (BE §4.1 item 9). */
export function flowNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "");
}
