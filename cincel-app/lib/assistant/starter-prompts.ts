/**
 * The "Herramientas" panel of the full `/asistente` page (redesign FE §3.9,
 * frames `AsistentePagina` and `AsistenteHerramientas`): one section per tool
 * group, each button puts a starter prompt in the composer without sending.
 * The Cutto group is drawn but disabled (links only, BE §11.2). Client-safe.
 */

export type AssistantStarterPrompt = {
  label: string;
  description: string;
  prompt: string;
  /** The registered tools this prompt relies on; it is shown only when the user has all of them (#1055). */
  tools: readonly string[];
};

export type AssistantToolGroup = {
  key: string;
  label: string;
  description: string;
  prompts: readonly AssistantStarterPrompt[];
  /** True for groups whose tools are not offered yet (Cutto). */
  disabled?: boolean;
  /** Shown under a disabled group. */
  disabledNote?: string;
};

export const ASSISTANT_TOOL_GROUPS: readonly AssistantToolGroup[] = [
  {
    key: "consulta",
    label: "Consulta y búsqueda",
    description: "Leer el estado del despacho sin cambiar nada.",
    prompts: [
      { label: "Buscar en Cincel", description: "Tareas, proyectos, personas, archivos y notas", prompt: "Busca en Cincel ", tools: ["search_workspace"] },
      { label: "Mis tareas", description: "Agrupadas por estatus y vencimiento", prompt: "¿Qué tareas tengo pendientes esta semana?", tools: ["list_my_tasks"] },
    ],
  },
  {
    key: "tareas",
    label: "Tareas",
    description: "Crear, asignar y mover trabajo.",
    prompts: [
      { label: "Minuta → tareas", description: "Convierte una minuta en varias tareas", prompt: "Convierte esta minuta en tareas con responsable y fecha:\n", tools: ["create_tasks_from_notes"] },
      { label: "Reprogramar tarea", description: "Mueve la fecha y avisa al responsable", prompt: "Mueve la fecha de entrega de la tarea ", tools: ["reschedule_task"] },
      { label: "Equilibrar carga", description: "Propone mover tareas entre personas", prompt: "Propón cómo equilibrar la carga de trabajo del equipo.", tools: ["team_workload_summary", "rebalance_workload"] },
    ],
  },
  {
    key: "agenda",
    label: "Agenda y calendario",
    description: "Encontrar horarios en tu agenda.",
    prompts: [
      { label: "Mi agenda", description: "Eventos y entregas de la semana", prompt: "¿Qué tengo en la agenda esta semana?", tools: ["list_events"] },
      { label: "Horario libre", description: "Huecos comunes dentro de la jornada", prompt: "Busca una hora libre esta semana para reunirme con ", tools: ["find_free_slots"] },
    ],
  },
  {
    key: "notificaciones",
    label: "Notificaciones y recordatorios",
    description: "Bandeja de Mi espacio y avisos al equipo.",
    prompts: [
      { label: "Avisos sin leer", description: "Asignaciones, menciones y vencimientos", prompt: "¿Qué notificaciones tengo sin leer?", tools: ["list_notifications"] },
      { label: "Recordatorio", description: "Con texto natural", prompt: "Recuérdame mañana a las 9:00 ", tools: ["create_reminder"] },
    ],
  },
  {
    key: "correo",
    label: "Correo (Gmail)",
    description: "Leer y preparar correo; enviar siempre con confirmación.",
    prompts: [
      { label: "Buscar correo", description: "Por persona, proyecto o texto", prompt: "Busca los correos de ", tools: ["search_email"] },
      { label: "Resumir hilo", description: "Resume un hilo y saca pendientes", prompt: "Resume el último hilo de correo sobre ", tools: ["search_email", "summarize_email_thread"] },
    ],
  },
  {
    key: "mi-espacio",
    label: "Mi espacio y jornada",
    description: "Notas, checklists y control de horario.",
    prompts: [
      { label: "Nota rápida", description: "Crea o agrega texto a una nota", prompt: "Crea una nota con ", tools: ["create_note"] },
      { label: "Mis horas", description: "Horas del día o la semana", prompt: "¿Cuántas horas llevo esta semana?", tools: ["get_my_hours"] },
    ],
  },
  {
    key: "personas",
    label: "Personas, clientes y proveedores",
    description: "Directorio, portal y cotizaciones.",
    prompts: [
      { label: "Ficha de una persona", description: "Carga, horas y disponibilidad", prompt: "¿Cómo está la carga y la disponibilidad de ", tools: ["get_person"] },
      { label: "Pedir cotizaciones", description: "A varios proveedores por correo", prompt: "Pide cotización a proveedores de ", tools: ["request_quotes"] },
    ],
  },
  {
    key: "arquitectura",
    label: "Herramientas de arquitectura",
    description: "Herramientas de arquitectura y obra. Abren un widget en la conversación.",
    prompts: [
      { label: "Áreas desde el plano", description: "Sube una planta y obtén m² por espacio", prompt: "Calcula los m² por espacio de esta planta.", tools: ["measure_areas_from_plan"] },
      { label: "Cuantificación", description: "Material, piezas y desperdicio", prompt: "Cuantifica el material para ", tools: ["quantity_takeoff"] },
      { label: "Costo por m²", description: "Estimado paramétrico por gama", prompt: "Estima el costo por m² de ", tools: ["parametric_cost_estimate"] },
      { label: "Revisión normativa", description: "Compara con la zonificación", prompt: "Revisa la normativa que aplica a ", tools: ["zoning_check"] },
      { label: "Bitácora con fotos", description: "Avance por partida desde fotos", prompt: "Arma la bitácora de obra con las fotos de ", tools: ["site_photo_log"] },
      { label: "Cronograma desde plantilla", description: "Tareas y fechas por área", prompt: "Genera el cronograma desde la plantilla para el proyecto ", tools: ["schedule_from_template"] },
      { label: "Moodboard", description: "Paleta y materiales de referencias", prompt: "Extrae la paleta y los materiales de estas referencias para ", tools: ["moodboard_from_references"] },
      { label: "Comparar cotizaciones", description: "Precio relativo y tiempos", prompt: "Compara las cotizaciones recibidas de ", tools: ["compare_quotes"] },
    ],
  },
  {
    key: "cutto",
    label: "Cutto",
    description: "Reuniones y mensajes en Cutto.",
    disabled: true,
    disabledNote: "La integración con Cutto aún no está disponible. Usa el enlace para abrir Cutto.",
    prompts: [
      { label: "Agendar reunión", description: "Reunión de Cutto con enlace", prompt: "", tools: ["create_meeting"] },
      { label: "Mandar mensaje", description: "Directo o canal del proyecto", prompt: "", tools: ["send_message"] },
    ],
  },
];

/**
 * The groups as one user sees them (#1055): each prompt only when every tool
 * it relies on is in `toolNames` (the user's tool set), and a group only
 * while it has prompts left. Disabled groups (Cutto) keep their prompts: they
 * are drawn disabled with the link, never offered.
 */
export function groupsForTools(
  toolNames: Iterable<string>,
  groups: readonly AssistantToolGroup[] = ASSISTANT_TOOL_GROUPS,
): AssistantToolGroup[] {
  const available = new Set(toolNames);
  return groups.flatMap((group) => {
    if (group.disabled) return [group];
    const prompts = group.prompts.filter((starter) => starter.tools.every((name) => available.has(name)));
    return prompts.length > 0 ? [{ ...group, prompts }] : [];
  });
}
