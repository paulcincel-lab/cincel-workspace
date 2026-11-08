/**
 * Safety check for scripts/seed-demo.ts: the demo data is for local and dev
 * databases only. It refuses to run when NODE_ENV is "production" or when
 * DATABASE_URL points at a host that is not this machine (or the local
 * docker-compose `db` service). There is no override flag on purpose.
 */

/** Hosts the demo seed accepts: this machine and the docker-compose service name. */
export const DEMO_SEED_LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "::1", "db"];

export const DEFAULT_DEMO_DATABASE_URL = "postgres://cincel:cincel@localhost:5432/cincel";

/** The host of a postgres connection string, lowercased, without brackets; "" for a socket or unparsable URL. */
export function databaseHost(connectionString: string): string {
  // postgres://user@/db?host=/var/run/postgresql has an empty authority host, which `new URL` rejects.
  const emptyHost = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?\/[^?#]*(\?[^#]*)?/i.exec(connectionString);
  if (emptyHost) return queryHost(emptyHost[1] ?? "");
  try {
    const url = new URL(connectionString);
    let host = url.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
    return host || queryHost(url.search);
  } catch {
    return "invalid";
  }
}

/** The `host` query parameter; "" when absent or a unix socket path (a socket is local). */
function queryHost(search: string): string {
  const socketHost = new URLSearchParams(search).get("host") ?? "";
  return socketHost.startsWith("/") ? "" : socketHost.toLowerCase();
}

/** Throws when the demo seed must not run against this environment; returns the connection string to use. */
export function assertDemoSeedAllowed(env: Record<string, string | undefined>): string {
  if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    throw new Error("Demo seed refused: NODE_ENV is production. The demo data is for local and dev databases only.");
  }
  const connectionString = env.DATABASE_URL?.trim() || DEFAULT_DEMO_DATABASE_URL;
  const host = databaseHost(connectionString);
  if (host === "invalid") {
    throw new Error("Demo seed refused: DATABASE_URL is not a valid connection string.");
  }
  if (host !== "" && !DEMO_SEED_LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Demo seed refused: DATABASE_URL points at "${host}", which is not a local host ` +
        `(${DEMO_SEED_LOCAL_HOSTS.join(", ")}). The demo data is for local and dev databases only.`
    );
  }
  return connectionString;
}
