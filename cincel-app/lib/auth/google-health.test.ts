// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Each `db.select()` chain resolves to the next queued result, in call order:
// group mappings, last Directory error, last Drive error, staff counts.
const results = vi.hoisted(() => ({ queue: [] as unknown[][] }));
vi.mock("@/lib/db/client", () => {
  const chain = (rows: unknown[]) => {
    const node: Record<string, unknown> = {};
    for (const step of ["from", "where", "groupBy", "orderBy", "limit"]) node[step] = () => node;
    node.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject);
    return node;
  };
  return { db: { select: () => chain(results.queue.shift() ?? []) } };
});

import { directoryErrorMessage, loadGoogleHealth, parseDirectoryErrorReason } from "./google-health";

const KEY = "ab".repeat(32);
const env = {
  GOOGLE_WORKSPACE_DOMAIN: " Cincel.Example ",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret-value",
  GOOGLE_SA_CLIENT_EMAIL: "sa@cincel.iam.gserviceaccount.com",
  GOOGLE_SA_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
  GOOGLE_SHARED_DRIVE_ID: "0AbcSharedDrive",
  TOKEN_ENCRYPTION_KEY: KEY,
};

describe("parseDirectoryErrorReason", () => {
  it("reads the kind and HTTP status", () => {
    expect(parseDirectoryErrorReason("http 403")).toEqual({ kind: "http", status: 403 });
    expect(parseDirectoryErrorReason("timeout")).toEqual({ kind: "timeout", status: null });
    expect(parseDirectoryErrorReason(null)).toEqual({ kind: "network", status: null });
  });

  it("gives a Spanish message per kind", () => {
    expect(directoryErrorMessage("http", 403)).toContain("403");
    expect(directoryErrorMessage("timeout", null)).toContain("a tiempo");
  });
});

describe("loadGoogleHealth", () => {
  beforeEach(() => {
    results.queue = [];
  });

  it("returns every GoogleHealth field with the last Directory and Drive errors", async () => {
    const at = new Date("2026-11-03T10:00:00Z");
    results.queue = [
      [
        { kind: "role", n: 2 },
        { kind: "position", n: 3 },
      ],
      [{ kind: "group_mapping_error", reason: "http 403", at }],
      [{ message: "No se pudo crear la carpeta", at }],
      [{ active: 7, googleLinked: 4 }],
    ];

    const health = await loadGoogleHealth(env);
    expect(health).toEqual({
      workspaceDomain: "cincel.example",
      oauthClientConfigured: true,
      groupMappingCount: 5,
      roleGroupMappingCount: 2,
      serviceAccountEmail: "sa@cincel.iam.gserviceaccount.com",
      sharedDriveId: "0AbcSharedDrive",
      tokenKeyConfigured: true,
      lastDirectoryError: {
        at: at.toISOString(),
        source: "group_mapping",
        kind: "http",
        status: 403,
        message: directoryErrorMessage("http", 403),
      },
      lastDriveError: { at: at.toISOString(), message: "No se pudo crear la carpeta" },
      googleLinkedStaff: 4,
      activeStaff: 7,
    });
  });

  it("never exposes a key or secret", async () => {
    results.queue = [[], [], [], [{ active: 1, googleLinked: 0 }]];
    const json = JSON.stringify(await loadGoogleHealth(env));
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("client-secret-value");
    expect(json).not.toContain("PRIVATE KEY");
  });

  it("flags missing domain, OAuth client and mappings", async () => {
    results.queue = [[], [], [], [{ active: 2, googleLinked: 0 }]];
    const health = await loadGoogleHealth({ GOOGLE_OAUTH_CLIENT_ID: "only-id", TOKEN_ENCRYPTION_KEY: "short" });
    expect(health).toMatchObject({
      workspaceDomain: null,
      oauthClientConfigured: false,
      groupMappingCount: 0,
      roleGroupMappingCount: 0,
      tokenKeyConfigured: false,
      lastDirectoryError: null,
      lastDriveError: null,
      googleLinkedStaff: 0,
      activeStaff: 2,
    });
  });
});
