/**
 * Static conversation starters of the full `/asistente` page: the example
 * questions and the three suggestion cards above the Visual composer. No
 * query: they come from `ASSISTANT_TOOL_GROUPS` and the example questions.
 * Client-safe.
 */
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

export type AssistantSuggestion = { text: string; topic: SuggestionTopic; tone: SuggestionTone };

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
  opts: { hasProject: boolean },
  groups: readonly AssistantToolGroup[] = ASSISTANT_TOOL_GROUPS,
): AssistantSuggestion[] {
  if (opts.hasProject) {
    const picked = PROJECT_GROUPS.flatMap((key) => {
      const text = firstPrompt(groups.find((group) => group.key === key));
      return text ? [{ text, topic: GROUP_TOPIC[key] ?? "search" }] : [];
    }).slice(0, 3);
    if (picked.length === 3) return picked.map((item, index) => ({ ...item, tone: TONES[index] }));
  }
  return EXAMPLE_QUESTIONS.slice(0, 3).map((text, index) => ({ text, topic: EXAMPLE_TOPICS[index], tone: TONES[index] }));
}
