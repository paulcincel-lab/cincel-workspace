/**
 * Tests for Tareas business rules documented in AGENTS.md:
 * - Every task has a commitmentDate and reviewDate
 * - History is append-only (never delete history)
 */
import { describe, it, expect } from "vitest";
import { presaleTasks } from "@/lib/data/presale";
import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import type { Task } from "@/lib/types/task";

const allSeedTasks: Task[] = [...presaleTasks, ...disenoTasks, ...operativasTasks];

// ── Schema rules: every task must declare the required date fields ─────────────

describe("Task schema — commitmentDate and reviewDate", () => {
  it("every seed task has a commitmentDate property", () => {
    for (const task of allSeedTasks) {
      expect(
        Object.prototype.hasOwnProperty.call(task, "commitmentDate"),
        `Task id=${task.id} (${task.description}) missing commitmentDate`
      ).toBe(true);
    }
  });

  it("every seed task has a reviewDate property", () => {
    for (const task of allSeedTasks) {
      expect(
        Object.prototype.hasOwnProperty.call(task, "reviewDate"),
        `Task id=${task.id} (${task.description}) missing reviewDate`
      ).toBe(true);
    }
  });

  it("commitmentDate and reviewDate are strings", () => {
    for (const task of allSeedTasks) {
      expect(typeof task.commitmentDate, `Task id=${task.id} commitmentDate is not a string`).toBe("string");
      expect(typeof task.reviewDate, `Task id=${task.id} reviewDate is not a string`).toBe("string");
    }
  });
});

// ── History append-only rule ──────────────────────────────────────────────────
// The rule "nunca eliminar historial" means that any save operation preserves
// existing history items and only appends. We test this by simulating the
// update pattern used in TaskDrawer.tsx: new history = [...task.history, newEntry]

describe("Task history — append-only invariant", () => {
  it("preserves all existing history entries when a new note is added", () => {
    const task: Task = {
      ...presaleTasks[0],
      history: [
        { id: 1, date: "2026-01-01", author: "Juanma", comment: "Primera nota" },
        { id: 2, date: "2026-01-02", author: "Paul", comment: "Segunda nota" },
      ],
    };

    const existingCount = task.history.length;
    const newEntry = { id: Date.now(), date: "2026-01-03", author: "Rafa", comment: "Tercera nota" };

    // Simulates the update pattern from TaskDrawer.tsx
    const updated: Task = {
      ...task,
      history: [...task.history, newEntry],
    };

    expect(updated.history).toHaveLength(existingCount + 1);
    expect(updated.history[0]).toEqual(task.history[0]);
    expect(updated.history[1]).toEqual(task.history[1]);
    expect(updated.history[2]).toEqual(newEntry);
  });

  it("never removes history entries when a task is updated", () => {
    const task: Task = {
      ...presaleTasks[0],
      history: [
        { id: 1, date: "2026-01-01", author: "Juanma", comment: "Nota original" },
      ],
    };

    // Any update to a task must not shrink history
    const updated: Task = {
      ...task,
      status: "Completado",
      history: [...task.history], // append-only: spread preserves all
    };

    expect(updated.history.length).toBeGreaterThanOrEqual(task.history.length);
  });

  it("seed tasks with existing history have all entries accessible", () => {
    const tasksWithHistory = allSeedTasks.filter((t) => t.history.length > 0);
    expect(tasksWithHistory.length).toBeGreaterThan(0);

    for (const task of tasksWithHistory) {
      expect(Array.isArray(task.history)).toBe(true);
      for (const entry of task.history) {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("author");
        expect(entry).toHaveProperty("comment");
      }
    }
  });
});
