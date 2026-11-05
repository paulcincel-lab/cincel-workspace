/**
 * monday people in Personas (#689): which monday users are not real people (deleted users, bots), how a monday user
 * matches a staff member (email first, then name) and the order Personas lists them in. Pure and client-safe; init
 * (scripts/monday/init.ts) and the wizard share these rules.
 */

/** The parts of a monday user these rules read. */
export interface MondayPersonLike {
  id: string;
  name: string;
  email: string | null;
  kind?: string | null;
  status?: string | null;
}

/** The parts of a staff member a match reads. */
export interface StaffLike {
  id: string;
  name: string;
  email: string | null;
}

/** monday gives a deleted user an address on this domain. */
const DELETED_DOMAIN = "@deleted.user";

const norm = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

/** A user monday deleted: its address is `…@deleted.user` or its status says so. */
export function isDeletedMondayUser(user: MondayPersonLike): boolean {
  return norm(user.email).endsWith(DELETED_DOMAIN) || norm(user.status) === "deleted";
}

/** A bot or the monday AI agent: its kind, or its address' user or domain part, is a bot or an agent. */
export function isMondayBot(user: MondayPersonLike): boolean {
  if (/\b(bot|agent)s?\b/.test(norm(user.kind))) return true;
  const email = norm(user.email);
  if (email && /(^|[^a-z])(bot|agent)s?([^a-z]|$)/.test(email)) return true;
  return /^monday(\.com)?\s+(ai|bot)\b/.test(norm(user.name));
}

/** Deleted users and bots: listed last under "Eliminados en monday" and ignored by default. */
export function isRetiredMondayUser(user: MondayPersonLike): boolean {
  return isDeletedMondayUser(user) || isMondayBot(user);
}

/** The staff member of a monday user: same email (case insensitive), else same name; never for retired users. */
export function matchStaff<T extends StaffLike>(
  user: MondayPersonLike,
  staff: readonly T[],
): { member: T; by: "email" | "name" } | null {
  if (isRetiredMondayUser(user)) return null;
  const email = norm(user.email);
  if (email) {
    const byEmail = staff.find((member) => norm(member.email) === email);
    if (byEmail) return { member: byEmail, by: "email" };
  }
  const name = norm(user.name);
  if (!name) return null;
  const byName = staff.filter((member) => norm(member.name) === name);
  // Two staff with the same name can't be told apart: no suggestion.
  return byName.length === 1 ? { member: byName[0], by: "name" } : null;
}

/** Personas' two lists: real people in export order, then the retired ones. */
export function splitMondayPeople<T extends MondayPersonLike>(users: readonly T[]): { people: T[]; retired: T[] } {
  const people: T[] = [];
  const retired: T[] = [];
  for (const user of users) (isRetiredMondayUser(user) ? retired : people).push(user);
  return { people, retired };
}

/** The DOM id of a person's row in Personas, so the Vista previa can link straight to it. */
export function personRowId(userId: string): string {
  return `persona-${userId}`;
}
