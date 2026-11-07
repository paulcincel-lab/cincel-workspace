// @vitest-environment node
/**
 * `vencimiento` producer, pure parts (BE §8.3, §9.3, §13): local dates, dedupe
 * key, copy, recipients, and that only the `daily-digest` job runs it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DAILY_PRODUCERS } from "./index";
import {
  vencimientoCopy,
  vencimientoDates,
  vencimientoDedupeKey,
  vencimientoProducer,
  vencimientoRecipients,
  type VencimientoTask,
} from "./vencimiento";

function task(overrides: Partial<VencimientoTask> = {}): VencimientoTask {
  return {
    id: "t1",
    title: "Revisar planos",
    kind: "usuario",
    commitmentDate: "2026-11-10",
    projectName: "Casa Lomas",
    managerId: "m1",
    managerActive: true,
    managerIsAdmin: false,
    ...overrides,
  };
}

describe("vencimientoDates", () => {
  it("uses the local day in America/Mexico_City", () => {
    // 2026-11-10 03:00 UTC is still 2026-11-09 in Mexico City.
    expect(vencimientoDates(new Date("2026-11-10T03:00:00Z"))).toEqual({
      today: "2026-11-09",
      tomorrow: "2026-11-10",
    });
  });

  it("rolls over month and year ends", () => {
    expect(vencimientoDates(new Date("2026-12-31T18:00:00Z"))).toEqual({
      today: "2026-12-31",
      tomorrow: "2027-01-01",
    });
  });
});

describe("vencimientoDedupeKey", () => {
  it("is one key per task per day", () => {
    expect(vencimientoDedupeKey("abc", "2026-11-09")).toBe("vencimiento:abc:2026-11-09");
  });
});

describe("vencimientoCopy", () => {
  it("says due tomorrow for a task due tomorrow", () => {
    expect(vencimientoCopy(task(), "2026-11-09")).toEqual({
      title: "Vence mañana: Revisar planos",
      body: "Casa Lomas · vence el 10/11/2026",
    });
  });

  it("says overdue for a task due before today", () => {
    expect(vencimientoCopy(task({ commitmentDate: "2026-11-01" }), "2026-11-09")).toEqual({
      title: "Tarea vencida: Revisar planos",
      body: "Casa Lomas · venció el 01/11/2026",
    });
  });
});

describe("vencimientoRecipients", () => {
  const admins = ["a1", "a2"];

  it("notifies the active manager of a non-admin task", () => {
    expect(vencimientoRecipients(task(), admins)).toEqual(["m1"]);
  });

  it("notifies nobody when the manager is inactive or missing", () => {
    expect(vencimientoRecipients(task({ managerActive: false }), admins)).toEqual([]);
    expect(vencimientoRecipients(task({ managerId: null, managerActive: false }), admins)).toEqual([]);
  });

  it("notifies an administrator manager of an admin task only", () => {
    expect(vencimientoRecipients(task({ kind: "admin", managerIsAdmin: true }), admins)).toEqual(["m1"]);
  });

  it("sends an admin task with a non-admin or no manager to the administrators", () => {
    expect(vencimientoRecipients(task({ kind: "admin" }), admins)).toEqual(admins);
    expect(vencimientoRecipients(task({ kind: "admin", managerId: null, managerActive: false }), admins)).toEqual(
      admins,
    );
  });
});

describe("registration", () => {
  it("is a registered daily producer", () => {
    expect(DAILY_PRODUCERS).toContain(vencimientoProducer);
    expect(vencimientoProducer.name).toBe("vencimiento");
  });

  it("is reachable only from the daily-digest job", () => {
    const jobsDir = join(__dirname, "..", "jobs");
    const importers = readdirSync(jobsDir)
      .filter((file) => file.endsWith(".ts") && !file.includes(".test."))
      .filter((file) => /daily-producers|vencimiento/.test(readFileSync(join(jobsDir, file), "utf8")));
    expect(importers.every((file) => file === "daily-digest.ts")).toBe(true);
    const tick = readFileSync(join(__dirname, "..", "tick.ts"), "utf8");
    expect(tick).not.toMatch(/daily-producers|vencimiento/);
  });
});
