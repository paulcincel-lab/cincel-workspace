import { getFakeDirectory } from "./fake-directory";
import { isGoogleFake } from "./fake";
import { DIRECTORY_SCOPES, getServiceAccountTokenSource, type AccessTokenSource } from "./service-account";

/**
 * Admin SDK Directory API, called by the service account as itself (custom
 * read-only admin role, no delegation). Used by the sign-in gate and the
 * periodic access re-check to read a staff member's Workspace status and
 * group membership.
 *
 * Every call has a 5 s timeout. Failures (timeout, network, 5xx, anything
 * unexpected) throw a `DirectoryError`; the caller treats them as "couldn't
 * verify", never as a denial. Expected "not found" answers are typed results.
 */

export const DIRECTORY_API_URL = "https://admin.googleapis.com/admin/directory/v1";
export const DIRECTORY_TIMEOUT_MS = 5_000;

/** `deleted` means the Directory has no user with that id. */
export type WorkspaceUserStatus = "active" | "suspended" | "archived" | "deleted";

export type DirectoryUser = {
  status: WorkspaceUserStatus;
  /** Null when the user doesn't exist. */
  primaryEmail: string | null;
};

export type DirectoryGroup = { id: string; email: string; name: string };

export type DirectoryClient = {
  /** users.get by Google `sub` (the Directory user id). */
  getUserStatus(sub: string): Promise<DirectoryUser>;
  /** members.hasMember, including nested groups. */
  hasMember(groupId: string, email: string): Promise<boolean>;
  /** groups.get by group email; null when the group doesn't exist. */
  getGroup(email: string): Promise<DirectoryGroup | null>;
};

export type DirectoryErrorKind = "timeout" | "network" | "http";

export class DirectoryError extends Error {
  constructor(
    message: string,
    readonly kind: DirectoryErrorKind,
    /** HTTP status for `http` errors. */
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "DirectoryError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type DirectoryClientOptions = {
  getAccessToken: AccessTokenSource;
  fetch?: FetchLike;
  timeoutMs?: number;
};

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(signal.reason);
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export function createDirectoryClient(options: DirectoryClientOptions): DirectoryClient {
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DIRECTORY_TIMEOUT_MS;

  /** GET a Directory path; null on 404. The timeout covers the token and the request. */
  async function get<T>(path: string): Promise<T | null> {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      const token = await Promise.race([options.getAccessToken(), rejectOnAbort(signal)]);
      response = await fetchImpl(`${DIRECTORY_API_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
      });
    } catch (error) {
      if (isAbort(error) || signal.aborted) {
        throw new DirectoryError(`El Directorio de Google no respondió en ${timeoutMs} ms`, "timeout");
      }
      throw new DirectoryError(
        `No se pudo contactar el Directorio de Google: ${error instanceof Error ? error.message : String(error)}`,
        "network",
      );
    }

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new DirectoryError(`El Directorio de Google respondió ${response.status}`, "http", response.status);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new DirectoryError("Respuesta inválida del Directorio de Google", "http", response.status);
    }
  }

  return {
    async getUserStatus(sub) {
      const user = await get<{ primaryEmail?: string; suspended?: boolean; archived?: boolean }>(
        `/users/${encodeURIComponent(sub)}?fields=primaryEmail,suspended,archived`,
      );
      if (!user) return { status: "deleted", primaryEmail: null };
      const status: WorkspaceUserStatus = user.suspended ? "suspended" : user.archived ? "archived" : "active";
      return { status, primaryEmail: user.primaryEmail ?? null };
    },

    async hasMember(groupId, email) {
      const result = await get<{ isMember?: boolean }>(
        `/groups/${encodeURIComponent(groupId)}/hasMember/${encodeURIComponent(email)}`,
      );
      if (!result) throw new DirectoryError(`El grupo ${groupId} no existe`, "http", 404);
      return result.isMember === true;
    },

    async getGroup(email) {
      const group = await get<{ id?: string; email?: string; name?: string }>(
        `/groups/${encodeURIComponent(email)}?fields=id,email,name`,
      );
      if (!group?.id) return null;
      return { id: group.id, email: group.email ?? email, name: group.name ?? "" };
    },
  };
}

/**
 * The app's Directory client: the fake with `GOOGLE_FAKE=1`, otherwise the
 * env-configured service account. Null when the service account isn't set up.
 */
export function getDirectory(): DirectoryClient | null {
  if (isGoogleFake()) return getFakeDirectory();
  const getAccessToken = getServiceAccountTokenSource(DIRECTORY_SCOPES);
  return getAccessToken ? createDirectoryClient({ getAccessToken }) : null;
}

export type WorkspaceMembership = {
  user: DirectoryUser;
  /** The subset of the requested group ids the email belongs to. */
  memberGroupIds: string[];
};

/**
 * `users.get` and every `hasMember` in parallel. Any failure rejects the whole
 * lookup with the first `DirectoryError`.
 */
export async function lookupMembership(
  directory: DirectoryClient,
  sub: string,
  email: string,
  groupIds: string[],
): Promise<WorkspaceMembership> {
  const [user, ...flags] = await Promise.all([
    directory.getUserStatus(sub),
    ...groupIds.map((groupId) => directory.hasMember(groupId, email)),
  ]);
  return { user, memberGroupIds: groupIds.filter((_, index) => flags[index]) };
}
