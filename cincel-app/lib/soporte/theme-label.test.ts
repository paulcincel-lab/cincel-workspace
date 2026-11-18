import { describe, expect, it } from "vitest";
import { formatThemeLabel } from "./theme-label";

describe("formatThemeLabel", () => {
  it("joins the theme label and the mode", () => {
    expect(formatThemeLabel("azul", "light")).toBe("Azul Cincel · claro");
    expect(formatThemeLabel("grafito", "dark")).toBe("Grafito · oscuro");
  });
  it("shows the mode alone without a theme id", () => {
    expect(formatThemeLabel(undefined, "dark")).toBe("oscuro");
    expect(formatThemeLabel("", "light")).toBe("claro");
    expect(formatThemeLabel("desconocido", "light")).toBe("claro");
  });
  it("is empty with nothing", () => {
    expect(formatThemeLabel(undefined, "")).toBe("");
  });
});
