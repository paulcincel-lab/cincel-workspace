import { describe, expect, it } from "vitest";

import { DISCARDED_MESSAGE, mapIssueToChange } from "./github-sync-map";

const open: Parameters<typeof mapIssueToChange>[1] = { state: "open", stateReason: null, labels: [], hasOpenPullRequest: false };

describe("mapIssueToChange", () => {
  it("label en progreso moves to en_progreso", () => {
    expect(mapIssueToChange("planeado", { ...open, labels: ["En progreso"] })).toEqual({ status: "en_progreso" });
  });
  it("an open linked PR moves to en_progreso", () => {
    expect(mapIssueToChange("planeado", { ...open, hasOpenPullRequest: true })).toEqual({ status: "en_progreso" });
  });
  it("an open issue without signals changes nothing", () => {
    expect(mapIssueToChange("planeado", open)).toBeNull();
  });
  it("never moves back from en_progreso on an open issue", () => {
    expect(mapIssueToChange("en_progreso", open)).toBeNull();
    expect(mapIssueToChange("en_progreso", { ...open, labels: ["en progreso"] })).toBeNull();
  });
  it("closed as completed is resuelto", () => {
    expect(mapIssueToChange("en_progreso", { ...open, state: "closed", stateReason: "completed" })).toEqual({ status: "resuelto" });
  });
  it("closed without reason is resuelto", () => {
    expect(mapIssueToChange("planeado", { ...open, state: "closed" })).toEqual({ status: "resuelto" });
  });
  it("closed as not planned is descartado with the public message", () => {
    expect(mapIssueToChange("planeado", { ...open, state: "closed", stateReason: "not_planned" })).toEqual({
      status: "descartado",
      message: DISCARDED_MESSAGE,
    });
  });
  it("no change when already at the mapped status", () => {
    expect(mapIssueToChange("resuelto", { ...open, state: "closed", stateReason: "completed" })).toBeNull();
    expect(mapIssueToChange("descartado", { ...open, state: "closed", stateReason: "not_planned" })).toBeNull();
  });
  it("a reopened issue moves a closed ticket back", () => {
    expect(mapIssueToChange("resuelto", { ...open, stateReason: "reopened" })).toEqual({ status: "planeado" });
    expect(mapIssueToChange("descartado", { ...open, labels: ["en progreso"] })).toEqual({ status: "en_progreso" });
  });
});
