// @vitest-environment node
/**
 * The Registro of a monday wizard job (#679): Spanish notes without server paths on screen, the CLI's English
 * output kept apart in `log` for the download.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRun, progressNote, readRun, startJob, UNEXPECTED_JOB_ERROR, waitForJob } from "@/lib/monday-import/runs";

const ADMIN = "33333333-3333-4333-8333-333333333333";

let root: string;
let env: Record<string, string | undefined>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "monday-notes-"));
  env = { MONDAY_IMPORT_DIR: root };
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("job notes", () => {
  it("notes the label, each progress step and the end in Spanish; the CLI output stays in the log", async () => {
    const run = await createRun(ADMIN, env);
    startJob(run.runId, "export", "Exportando tableros", async ({ io, progress, note }) => {
      io.stdout(`Export finished: 2/2 boards in ${root}/${run.runId} (12 calls this run).\n`);
      progress(1, 2, "Exportando tableros");
      progress(1, 2, "Exportando tableros");
      progress(2, 2, "Exportando tableros");
      note("Equivalencias preparadas a partir de la exportación.");
      progress(2, 2, "Exportación terminada");
      return null;
    }, env);
    await waitForJob(run.runId, "export");
    const job = (await readRun(run.runId, env))!.jobs.export!;

    expect(job.notes).toEqual([
      "Exportando tableros",
      "Exportando tableros (1 de 2)",
      "Exportando tableros (2 de 2)",
      "Equivalencias preparadas a partir de la exportación.",
      "Exportación terminada (2 de 2)",
      "Terminado.",
    ]);
    expect(job.notes!.join("\n")).not.toContain(root);
    expect(job.log.join("\n")).toContain("Export finished");
  });

  it("ends a failed job with a note that holds no error text", async () => {
    const run = await createRun(ADMIN, env);
    startJob(run.runId, "apply", "Importando a Cincel", async () => {
      throw new Error(`EACCES: permission denied, open '${root}/x'`);
    }, env);
    await waitForJob(run.runId, "apply");
    const job = (await readRun(run.runId, env))!.jobs.apply!;
    expect(job.notes).toEqual(["Importando a Cincel", "No se terminó."]);
  });

  it("shows a fixed Spanish error for a thrown error and keeps the raw text in the log", async () => {
    const run = await createRun(ADMIN, env);
    const raw = `ENOSPC: no space left on device, open '${root}/${run.runId}/wizard.json.tmp'`;
    startJob(run.runId, "export", "Exportando tableros", async () => {
      throw new Error(raw);
    }, env);
    await waitForJob(run.runId, "export");
    const job = (await readRun(run.runId, env))!.jobs.export!;
    expect(job.status).toBe("failed");
    expect(job.error).toBe(UNEXPECTED_JOB_ERROR);
    expect(job.log).toContain(raw);
  });

  it("lets the caller describe a thrown error", async () => {
    const run = await createRun(ADMIN, env);
    startJob(run.runId, "apply", "Importando a Cincel", async () => {
      throw new Error("boom");
    }, env, () => "La carpeta de importación no tiene permisos de escritura.");
    await waitForJob(run.runId, "apply");
    const job = (await readRun(run.runId, env))!.jobs.apply!;
    expect(job.error).toBe("La carpeta de importación no tiene permisos de escritura.");
  });

  it("writes the counts only when there is more than one step", () => {
    expect(progressNote(1, 3, "Exportando tableros")).toBe("Exportando tableros (1 de 3)");
    expect(progressNote(1, 1, "Importación terminada")).toBe("Importación terminada");
    expect(progressNote(0, null, "Importando a Cincel")).toBe("Importando a Cincel");
  });
});
