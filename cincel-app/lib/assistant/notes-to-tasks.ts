/**
 * Task titles from free-form notes (redesign BE §10.3 `create_tasks_from_notes`).
 * Pure and client-safe: the approval card counts the tasks with it before the
 * tool runs, and the tool creates exactly these titles.
 *
 * Rules: one task per non-empty line; bullets ("-", "*", "•", "–"), numbering
 * ("1.", "2)", "a)") and checkboxes ("[ ]", "[x]") are stripped; lines ending in
 * ":" are headings and lines shorter than 3 characters are dropped; duplicates
 * (case- and accent-insensitive) collapse; titles are capped at 200 characters
 * and the list at `MAX_TASKS_FROM_NOTES`.
 */

export const MAX_TASKS_FROM_NOTES = 30;

const MAX_TITLE = 200;

const PREFIX = /^\s*(?:[-*•–·]+\s*|\d{1,3}[.)]\s+|[a-zA-Z][.)]\s+)?(?:\[[ xX✓]?\]\s*)?/;

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTaskTitles(text: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.replace(PREFIX, "").replace(/\s+/g, " ").trim();
    if (line.length < 3 || line.endsWith(":")) continue;
    const title = line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1).trimEnd()}…` : line;
    const key = fold(title);
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title.charAt(0).toUpperCase() + title.slice(1));
    if (titles.length === MAX_TASKS_FROM_NOTES) break;
  }
  return titles;
}
