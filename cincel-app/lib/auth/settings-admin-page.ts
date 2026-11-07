import "server-only";

import { notFound, redirect } from "next/navigation";

import { CHANGE_PASSWORD_ROUTE, LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { getSessionAccess, type SessionAccess } from "@/lib/auth/session";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";

export type SettingsAdminUser = NonNullable<SessionAccess["user"]>;

/**
 * Page-level check of the Organización segments that keep today's rule
 * (`/ajustes/monday`, `/ajustes/google`, `/ajustes/tramos`, `/ajustes/puestos`;
 * redesign FE §8: "Administrador (today's rule)"). The segment `layout.tsx`
 * guards the same rule; the page repeats it because it loads admin data.
 * A guest goes to `/login`, a first-access account to `/change-password`, any
 * other viewer without the Administrador access gets `notFound()`.
 */
export async function requireSettingsAdminPage(): Promise<SettingsAdminUser> {
  const access = await getSessionAccess();
  if (access.status === "guest") redirect(LOGIN_ROUTE);
  if (access.status === "pending_first_access") redirect(CHANGE_PASSWORD_ROUTE);
  if (access.status !== "active" || !access.user || access.user.access !== SYSTEM_ADMIN_ROLE) notFound();
  return access.user;
}
