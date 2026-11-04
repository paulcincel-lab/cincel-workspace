// @vitest-environment node
/**
 * The monday import wizard when its import folder can't be created or written
 * (#676): opening a run shows a clear Spanish error instead of the generic one,
 * and the folder is logged once.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsFail = vi.hoisted(() => ({ code: null as string | null }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const fail = (path: unknown) => {
    const err = new Error(`${fsFail.code}: permission denied, mkdir '${String(path)}'`) as NodeJS.ErrnoException;
    err.code = fsFail.code ?? undefined;
    return err;
  };
  return {
    ...actual,
    mkdir: vi.fn(async (...args: Parameters<typeof actual.mkdir>) => {
      if (fsFail.code) throw fail(args[0]);
      return actual.mkdir(...args);
    }),
  };
});

import type { ImportDb } from "@/lib/import/refs";
import { NOT_WRITABLE, openRun, WizardError, type WizardDeps } from "@/lib/monday-import/service";

const ADMIN = "33333333-3333-4333-8333-333333333333";

let root: string;
let deps: WizardDeps;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "monday-folder-"));
  deps = { db: {} as ImportDb, env: { MONDAY_IMPORT_DIR: join(root, "wizard") } };
  fsFail.code = null;
});

afterEach(() => {
  fsFail.code = null;
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("monday wizard import folder", () => {
  it("opens a run when the folder is writable", async () => {
    const run = await openRun(ADMIN, deps);
    expect(run.step).toBe("conectar");
  });

  it("shows a Spanish error and logs the folder once when it isn't writable", async () => {
    fsFail.code = "EACCES";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const first = openRun(ADMIN, deps);
    await expect(first).rejects.toBeInstanceOf(WizardError);
    await expect(openRun(ADMIN, deps)).rejects.toThrow(NOT_WRITABLE);
    expect(NOT_WRITABLE).toBe("La carpeta de importación no tiene permisos de escritura.");

    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(join(root, "wizard"));
  });

  it("treats a read-only folder the same way", async () => {
    fsFail.code = "EROFS";
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(openRun(ADMIN, { ...deps, env: { MONDAY_IMPORT_DIR: join(root, "ro") } })).rejects.toThrow(
      NOT_WRITABLE,
    );
  });

  it("leaves other file system errors alone", async () => {
    fsFail.code = "ENOSPC";
    await expect(openRun(ADMIN, deps)).rejects.not.toBeInstanceOf(WizardError);
  });
});
