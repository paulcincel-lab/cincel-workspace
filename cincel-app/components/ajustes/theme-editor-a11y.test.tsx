// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { OrgAppearance, ThemeId } from "@/lib/types/redesign";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({ getAjustesTemaPageData: vi.fn() }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn() }));
vi.mock("@/lib/actions/org-appearance-actions", () => ({
  saveOrgAppearanceAction: vi.fn(async (input: unknown) => input),
  resetOrgAppearanceAction: vi.fn(),
  fetchOrgAppearanceAction: vi.fn(),
}));

import { ThemeEditor } from "./ThemeEditor";

/** The editor with `org` hydrated as the published theme (`qk.ajustes.page('tema')`). */
function renderEditor(org: OrgAppearance) {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("tema"), { org });
  return renderWithQueryClient(<ThemeEditor presets={THEME_PRESETS} />, { client });
}

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
      const { container } = renderEditor(THEME_PRESETS[id]);
      if (mode === "dark") fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
      expect(screen.getByTestId("theme-preview").getAttribute("data-mode")).toBe(mode);
      expect(await seriousViolations(container)).toEqual([]);
    },
  );

  it("marks a failing row with aria-invalid and a described message, still without violations", async () => {
    const { container } = renderEditor(THEME_PRESETS.azul);
    const input = document.getElementById("token-muted-foreground") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#c0c0c0" } });
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(describedBy)?.textContent).toContain("--muted-foreground");
    expect(await seriousViolations(container)).toEqual([]);
  });
});
