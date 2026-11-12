/**
 * Static conversation starters of the full `/asistente` page: the example
 * questions and the three suggestion cards above the Visual composer. No
 * query: they come from `ASSISTANT_TOOL_GROUPS` and the example questions.
 * Client-safe.
 */
import { EMPTY_CALENDARIO_HINTS, firstName, shortDate, type CalendarioAssistantHints } from "@/lib/assistant/calendar-hints";
import { ASSISTANT_TOOL_GROUPS, type AssistantToolGroup } from "@/lib/assistant/starter-prompts";

/** Example questions with the tools that answer them (every role has these; guard test, #1055). */
export const EXAMPLES: readonly { text: string; tools: readonly string[] }[] = [
  { text: "¿Qué entregas vencen esta semana?", tools: ["list_activities_due"] },
  { text: "¿Quién está más saturado en el equipo?", tools: ["team_workload_summary"] },
  { text: "¿Qué proyectos están en riesgo alto?", tools: ["list_projects"] },
  { text: "¿Hay tareas bloqueadas?", tools: ["list_activities_due"] },
  { text: "Compara el avance de los proyectos activos", tools: ["list_projects", "render_stat_grid"] },
  { text: "Muéstrame la ocupación de cada persona del equipo", tools: ["team_workload_summary", "render_chart"] },
];

export const EXAMPLE_QUESTIONS: readonly string[] = EXAMPLES.map((example) => example.text);

/** Tint of a suggestion card's tile (a tint token with its ink). */
export type SuggestionTone = "primary" | "violet" | "warning" | "cyan" | "success";

/** What a suggestion card is about; the widget picks the icon. */
export type SuggestionTopic = "agenda" | "team" | "risk" | "tasks" | "search" | "calendar";

export type AssistantSuggestion = {
  text: string;
  topic: SuggestionTopic;
  tone: SuggestionTone;
  /** The registered tools the suggestion runs (guard test, #1055). */
  tools?: readonly string[];
};

const TONES: readonly SuggestionTone[] = ["primary", "violet", "warning"];

/** Groups that answer about a project, in the order the cards use with a project in context. */
const PROJECT_GROUPS: readonly string[] = ["consulta", "tareas", "agenda"];

const GROUP_TOPIC: Record<string, SuggestionTopic> = {
  consulta: "search",
  tareas: "tasks",
  agenda: "calendar",
};

const EXAMPLE_TOPICS: readonly SuggestionTopic[] = ["agenda", "team", "risk"];

/** A prompt that reads as a whole question (not one that waits for a name or a pasted text). */
function isComplete(prompt: string): boolean {
  const text = prompt.trimEnd();
  return text.length > 0 && text === prompt && !/[:\n]$/.test(text);
}

/** The first complete prompt of an enabled group. */
function firstPrompt(group: AssistantToolGroup | undefined): string | null {
  if (!group || group.disabled) return null;
  return group.prompts.find((starter) => isComplete(starter.prompt))?.prompt ?? null;
}

/**
 * Three cards: with a project in context, the first complete prompt of each
 * project group; otherwise the first three example questions.
 */
export function pickSuggestions(
  opts: { hasProject: boolean; route?: string | null; hints?: CalendarioAssistantHints },
  groups: readonly AssistantToolGroup[] = ASSISTANT_TOOL_GROUPS,
): AssistantSuggestion[] {
  if (isCalendarioRoute(opts.route)) {
    const calendario = calendarioSuggestions(opts.hints, groups);
    if (calendario.length > 0) return calendario;
  }
  if (opts.hasProject) {
    const picked = PROJECT_GROUPS.flatMap((key) => {
      const text = firstPrompt(groups.find((group) => group.key === key));
      return text ? [{ text, topic: GROUP_TOPIC[key] ?? "search" }] : [];
    }).slice(0, 3);
    if (picked.length === 3) return picked.map((item, index) => ({ ...item, tone: TONES[index] }));
  }
  return EXAMPLE_QUESTIONS.slice(0, 3).map((text, index) => ({ text, topic: EXAMPLE_TOPICS[index], tone: TONES[index] }));
}

/** True on the Calendario page (`/calendario`, with or without a query). */
export function isCalendarioRoute(route: string | null | undefined): boolean {
  return (route ?? "").split("?")[0].replace(/\/+$/, "") === "/calendario";
}

/**
 * The four canvas suggestions of the Calendario (BE §11.5), with the real next
 * delivery date and a real teammate ("una persona" when there is none). Each
 * one is shown only when the `calendario` group still has the prompt that
 * relies on the same tools (the viewer's tool set, #1055).
 */
export function calendarioSuggestions(
  hints: CalendarioAssistantHints = EMPTY_CALENDARIO_HINTS,
  groups: readonly AssistantToolGroup[] = ASSISTANT_TOOL_GROUPS,
): AssistantSuggestion[] {
  const offered = new Set(groups.find((group) => group.key === "calendario")?.prompts.flatMap((p) => p.tools) ?? []);
  const who = hints.teammate ? firstName(hints.teammate) : "una persona";
  const candidates: AssistantSuggestion[] = [
    {
      text: hints.nextDelivery
        ? `¿Qué vence antes de la entrega del ${shortDate(hints.nextDelivery)}?`
        : "¿Qué vence antes de mi próxima entrega?",
      topic: "calendar",
      tone: "primary",
      tools: ["calendar_range"],
    },
    { text: "Resume mi día de hoy", topic: "agenda", tone: "violet", tools: ["summarize_day"] },
    { text: `Busca un hueco de 2 horas para ${who} esta semana`, topic: "team", tone: "warning", tools: ["find_free_slots"] },
    { text: "Mueve todo lo vencido a días con menos carga", topic: "risk", tone: "primary", tools: ["find_overloads", "move_tasks"] },
  ];
  return candidates.filter((item) => (item.tools ?? []).every((name) => offered.has(name)));
}
