import { describe, expect, it } from "vitest";
import { showsPersonSelector } from "./person-selector";

describe("showsPersonSelector", () => {
  it("hides the person selector on company sections", () => {
    expect(showsPersonSelector("empresa")).toBe(false);
  });

  it("keeps it on personal and overview sections", () => {
    expect(showsPersonSelector("mis-documentos")).toBe(true);
    expect(showsPersonSelector("formacion")).toBe(true);
    expect(showsPersonSelector("overview")).toBe(true);
  });
});
