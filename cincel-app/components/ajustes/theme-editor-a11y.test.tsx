// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

import type { ThemeId } from "@/lib/types/redesign";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/org-appearance-actions", () => ({
  saveOrgAppearanceAction: vi.fn(async (input: unknown) => input),
  resetOrgAppearanceAction: vi.fn(),
  fetchOrgAppearanceAction: vi.fn(),
}));

import { ThemeEditor } from "./ThemeEditor";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide; the
  // token pairs themselves are gated by `checkContrast` (FE §14.6).
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => cleanup());

describe("ThemeEditor accessibility", () => {
  it.each(THEME_IDS.flatMap((id) => [[id, "light"] as const, [id, "dark"] as const]))(
    "%s in %s mode has no serious or critical axe violations",
    async (id: ThemeId, mode: "light" | "dark") => {
      const { container } = render(<ThemeEditor initial={THEME_PRESETS[id]} presets={THEME_PRESETS} />);
      if (mode === "dark") fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
      expect(screen.getByTestId("theme-preview").getAttribute("data-mode")).toBe(mode);
      expect(await seriousViolations(container)).toEqual([]);
    },
  );

  it("marks a failing row with aria-invalid and a described message, still without violations", async () => {
    const { container } = render(<ThemeEditor initial={THEME_PRESETS.azul} presets={THEME_PRESETS} />);
    const input = document.getElementById("token-muted-foreground") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#c0c0c0" } });
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(describedBy)?.textContent).toContain("--muted-foreground");
    expect(await seriousViolations(container)).toEqual([]);
  });
});
