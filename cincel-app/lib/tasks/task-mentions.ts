/**
 * `@Nombre Apellido` mentions in task comments (redesign BE §8.3): a mention
 * resolves to the staff member whose full name (`name` + `lastName`) matches
 * exactly, ignoring case and accents. Pure, so the action and the tests share it.
 */

export type MentionableStaff = { id: string; name: string; lastName: string | null };

/** Lowercase, accents stripped, inner whitespace collapsed to one space. */
export function normalizeMentionText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Nombre Apellido", or "Nombre" when the staff row has no last name. */
export function staffFullName(person: MentionableStaff): string {
  return [person.name, person.lastName].filter((part) => part && part.trim()).join(" ");
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * The ids of the staff mentioned in `comment`, each once, in order of first
 * mention. At each `@`, the longest full name that matches and ends on a word
 * boundary wins ("@Ana López" is Ana López, not a staff member named "Ana").
 */
export function resolveMentions(comment: string, staffList: readonly MentionableStaff[]): string[] {
  const text = normalizeMentionText(comment);
  if (!text.includes("@")) return [];
  const candidates = staffList
    .map((person) => ({ id: person.id, key: normalizeMentionText(staffFullName(person)) }))
    .filter((candidate) => candidate.key.length > 0)
    .sort((a, b) => b.key.length - a.key.length);

  const found: string[] = [];
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    const start = at + 1;
    const match = candidates.find((candidate) => {
      if (!text.startsWith(candidate.key, start)) return false;
      const next = text.charAt(start + candidate.key.length);
      return next === "" || !WORD_CHAR.test(next);
    });
    if (match && !found.includes(match.id)) found.push(match.id);
  }
  return found;
}
