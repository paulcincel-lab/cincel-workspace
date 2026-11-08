/**
 * Seeds `useSessionStore` for component tests that read the signed-in user
 * through `useSessionStore(selectCurrentUser)`. Takes the same partial
 * `AuthenticatedUser` shape the tests used to return from a mocked
 * `getCurrentAuthenticatedUser()`, so a test keeps its user unchanged:
 *
 *   seedSessionUser({ member: { id: "s1", name: "Ana" }, access: "Colaborador" });
 *   seedSessionUser(null); // a guest
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SessionAccess } from "@/lib/auth/session";
import { useSessionStore } from "@/lib/stores/session-store";

export type SessionUserSeed = {
  member?: Partial<AuthenticatedUser["member"]>;
  email?: string;
  access?: AuthenticatedUser["access"] | string;
};

export function sessionAccessFor(seed: SessionUserSeed | null): SessionAccess {
  if (!seed) return { status: "guest", user: null };
  const member = seed.member ?? {};
  return {
    status: "active",
    user: {
      id: member.id ?? "test-user",
      name: member.name ?? "",
      email: seed.email ?? member.institutionalEmail ?? null,
      role: member.role ?? null,
      area: member.area ?? null,
      active: member.active ?? true,
      mustChangePassword: false,
      googleLinked: false,
      access: seed.access as AuthenticatedUser["access"],
    },
  } as SessionAccess;
}

/** Sets the session store to `seed` (an active session), or a guest for null. */
export function seedSessionUser(seed: SessionUserSeed | null): void {
  useSessionStore.setState({ access: sessionAccessFor(seed) });
}
