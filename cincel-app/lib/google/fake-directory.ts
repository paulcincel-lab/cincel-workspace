import { DirectoryError, type DirectoryClient, type DirectoryErrorKind, type WorkspaceUserStatus } from "./directory";

/**
 * In-memory Directory used with `GOOGLE_FAKE=1` (tests and local e2e only).
 *
 * The state comes from `GOOGLE_FAKE_DIRECTORY` (JSON, read on first use) or
 * from `setFakeDirectoryState()` in tests. Membership is by email, case
 * insensitive; groups don't nest. Set `failWith` to simulate an outage.
 */

export type FakeDirectoryUser = {
  /** Google `sub` / Directory user id. */
  id: string;
  primaryEmail: string;
  status?: Exclude<WorkspaceUserStatus, "deleted">;
};

export type FakeDirectoryGroup = { id: string; email: string; name?: string; members?: string[] };

export type FakeDirectoryState = {
  users?: FakeDirectoryUser[];
  groups?: FakeDirectoryGroup[];
  /** Every call throws a `DirectoryError` of this kind. */
  failWith?: DirectoryErrorKind;
};

let state: FakeDirectoryState | null = null;

function parseEnvState(raw: string | undefined): FakeDirectoryState {
  if (!raw?.trim()) return {};
  try {
    return JSON.parse(raw) as FakeDirectoryState;
  } catch {
    throw new Error("GOOGLE_FAKE_DIRECTORY no es JSON válido");
  }
}

function current(): FakeDirectoryState {
  state ??= parseEnvState(process.env.GOOGLE_FAKE_DIRECTORY);
  return state;
}

/** Replaces the fake's state; `null` goes back to `GOOGLE_FAKE_DIRECTORY`. */
export function setFakeDirectoryState(next: FakeDirectoryState | null): void {
  state = next;
}

function failIfConfigured(): void {
  const kind = current().failWith;
  if (kind) throw new DirectoryError("Falla simulada del Directorio de Google", kind, kind === "http" ? 503 : null);
}

const lower = (value: string) => value.trim().toLowerCase();

const fakeDirectory: DirectoryClient = {
  async getUserStatus(sub) {
    failIfConfigured();
    const user = current().users?.find((candidate) => candidate.id === sub);
    if (!user) return { status: "deleted", primaryEmail: null };
    return { status: user.status ?? "active", primaryEmail: user.primaryEmail };
  },

  async hasMember(groupId, email) {
    failIfConfigured();
    const group = current().groups?.find((candidate) => candidate.id === groupId);
    if (!group) throw new DirectoryError(`El grupo ${groupId} no existe`, "http", 404);
    return (group.members ?? []).some((member) => lower(member) === lower(email));
  },

  async getGroup(email) {
    failIfConfigured();
    const group = current().groups?.find((candidate) => lower(candidate.email) === lower(email));
    return group ? { id: group.id, email: group.email, name: group.name ?? group.email } : null;
  },
};

export function getFakeDirectory(): DirectoryClient {
  return fakeDirectory;
}
