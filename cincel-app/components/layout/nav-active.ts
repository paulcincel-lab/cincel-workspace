export type NavActiveOptions = {
  exact?: boolean;
  /** Paths under the item's href that belong to another menu entry and must not light this one up. */
  excludePrefixes?: string[];
};

const matchesPrefix = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isNavPathActive(pathname: string, href: string, { exact = false, excludePrefixes = [] }: NavActiveOptions = {}) {
  if (exact) return pathname === href;
  if (!matchesPrefix(pathname, href)) return false;
  return !excludePrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}
