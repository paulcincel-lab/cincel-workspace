/**
 * Gmail → project suggestion (redesign BE §8.6): a normalized project name
 * (≥ 4 chars) as a whole word in the subject, or in the snippet when ≥ 8
 * chars; ties → most recently updated project. Never auto-links. Pure.
 *
 * The caller passes only the active projects visible to the staff member;
 * this function never widens that list.
 */

/** Shortest normalized project name that can be suggested. */
export const SUGGEST_MIN_NAME_LENGTH = 4;
/** Shortest snippet that is searched at all. */
export const SUGGEST_MIN_SNIPPET_LENGTH = 8;

/** Lowercase, accents removed, punctuation → spaces, single-spaced. */
export function normalizeForSuggestion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Whole-word (or whole word sequence) containment on normalized text. */
function containsWords(haystack: string, needle: string): boolean {
  return haystack !== "" && ` ${haystack} `.includes(` ${needle} `);
}

export function suggestProjectId(
  thread: { subject: string; snippet: string },
  projects: { id: string; name: string; updatedAt: string }[],
): string | null {
  const subject = normalizeForSuggestion(thread.subject);
  const snippet = thread.snippet.trim().length >= SUGGEST_MIN_SNIPPET_LENGTH ? normalizeForSuggestion(thread.snippet) : "";

  let best: { id: string; updatedAt: number } | null = null;
  for (const project of projects) {
    const name = normalizeForSuggestion(project.name);
    if (name.length < SUGGEST_MIN_NAME_LENGTH) continue;
    if (!containsWords(subject, name) && !containsWords(snippet, name)) continue;
    const updatedAt = Date.parse(project.updatedAt);
    const stamp = Number.isFinite(updatedAt) ? updatedAt : 0;
    if (!best || stamp > best.updatedAt) best = { id: project.id, updatedAt: stamp };
  }
  return best?.id ?? null;
}
