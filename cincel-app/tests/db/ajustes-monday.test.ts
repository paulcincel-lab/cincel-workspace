// @vitest-environment node
/**
 * Ajustes › Importar de monday page data (#966) against a real Postgres.
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Runs live in a temporary MONDAY_IMPORT_DIR that is
 * removed afterwards.
 *
 * - `getAjustesMondayPageData` is FORBIDDEN for a guest, a non-admin and the
 *   bootstrap admin.
 * - It only reads: with no run it answers `run: null` and creates no run
 *   folder; with a run it answers that run and changes nothing on disk.
 * - The dehydrated `status` carries no token.
 */
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const BOOTSTRAP = "bootstrap-monday@cincel.example";

describe.skipIf(!url)("Ajustes › monday page data (test DB)", async () => {
  const { asViewer } = await import("@/lib/query/test-utils");
  const { getAjustesMondayPageData } = await import("@/lib/actions/page-data/ajustes-actions");
  const { createRun } = await import("@/lib/monday-import/runs");

  let root = "";
  const admin = { id: "00000000-0000-4000-8000-0000000000a1", access: "Administrador" as const, email: "admin-monday@cincel.example" };

  /** Every file under the import root with its size and mtime, so any write shows. */
  async function snapshot(dir: string): Promise<string[]> {
    const out: string[] = [];
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return out;
    }
    for (const name of entries.sort()) {
      const path = join(dir, name);
      const info = await stat(path);
      if (info.isDirectory()) out.push(`${name}/`, ...(await snapshot(path)).map((child) => `${name}/${child}`));
      else out.push(`${name} ${info.size} ${info.mtimeMs}`);
    }
    return out;
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cincel-monday-page-"));
  });

  beforeEach(async () => {
    vi.stubEnv("MONDAY_IMPORT_DIR", root);
    vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", BOOTSTRAP);
    vi.stubEnv("MONDAY_TOKEN", "secret-monday-token");
    for (const name of await readdir(root)) await rm(join(root, name), { recursive: true, force: true });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("is FORBIDDEN for a guest, a non-admin and the bootstrap admin, and reads nothing", async () => {
    await expect(asViewer(null, () => getAjustesMondayPageData({}))).rejects.toThrow("FORBIDDEN");
    await expect(
      asViewer({ id: admin.id, access: "Colaborador" }, () => getAjustesMondayPageData({})),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asViewer({ id: admin.id, access: "Dirección" }, () => getAjustesMondayPageData({})),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asViewer({ ...admin, email: BOOTSTRAP }, () => getAjustesMondayPageData({})),
    ).rejects.toThrow("FORBIDDEN");
    expect(await readdir(root)).toEqual([]);
  });

  it("answers run: null with no run and creates no run folder", async () => {
    const before = await snapshot(root);
    const data = await asViewer(admin, () => getAjustesMondayPageData({}));
    expect(data.run).toBeNull();
    expect(data.errors.load).toBeNull();
    expect(Array.isArray(data.history)).toBe(true);
    // Twice, as two page loads would.
    await asViewer(admin, () => getAjustesMondayPageData({}));
    expect(await snapshot(root)).toEqual(before);
    expect(await readdir(root)).toEqual([]);
  });

  it("answers the latest run without touching it or opening another", async () => {
    const run = await createRun(admin.id, process.env);
    const wizardFile = join(root, run.runId, "wizard.json");
    const content = await readFile(wizardFile, "utf8");
    const before = await snapshot(root);

    const data = await asViewer(admin, () => getAjustesMondayPageData({}));
    expect(data.run?.runId).toBe(run.runId);
    expect(data.run?.step).toBe("conectar");

    expect(await snapshot(root)).toEqual(before);
    expect(await readFile(wizardFile, "utf8")).toBe(content);
  });

  it("puts only whether the server has a token in status, never the token", async () => {
    const data = await asViewer(admin, () => getAjustesMondayPageData({}));
    expect(Object.keys(data.status)).toEqual(["hasServerToken"]);
    expect(data.status.hasServerToken).toBe(true);
    expect(JSON.stringify(data)).not.toContain("secret-monday-token");
  });
});
