// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import ChangePasswordCard from "@/components/auth/ChangePasswordCard";
import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId } from "@/lib/types/redesign";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/auth-actions", () => ({
  completeFirstAccessAction: vi.fn(),
}));

/** Applies a theme and mode the way the flag-on root layout does. */
function applyTheme(theme: ThemeId, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
  const vars = Object.entries(THEME_PRESETS[theme].tokens)
    .map(([name, value]) => `--${name}:${value[mode]};`)
    .join("");
  let block = document.getElementById("appearance");
  if (!block) {
    block = document.createElement("style");
    block.id = "appearance";
    document.head.appendChild(block);
  }
  block.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
}

function resetTheme() {
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
  document.getElementById("appearance")?.remove();
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom does not provide;
  // the token pairs are covered through CONTRAST_PAIRS below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

/** Text / background token pairs the redesigned page draws with. */
const USED_PAIRS = [
  "foreground/background",
  "foreground/card",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "success/card",
  "sidebar-foreground/sidebar",
  "sidebar-primary-foreground/sidebar-primary",
];

const SOURCES = [
  "components/auth/ChangePasswordCard.tsx",
  "components/auth/use-change-password.ts",
  "app/change-password/page.tsx",
];

describe("change-password accessibility", () => {
  afterEach(() => {
    cleanup();
    resetTheme();
  });

  const cases = THEME_IDS.flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme, mode] as const));

  it.each(cases)("has no serious or critical axe violations (%s, %s)", async (theme, mode) => {
    applyTheme(theme, mode);
    const { container } = render(
      <AuthSplitLayout>
        <ChangePasswordCard />
      </AuthSplitLayout>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("gives every field a label and describes the requirements", () => {
    const { getByLabelText, getByRole } = render(<ChangePasswordCard />);
    const next = getByLabelText("Contraseña nueva");
    expect(next.getAttribute("aria-describedby")).toBe("change-password-requirements");
    expect(getByLabelText("Confirmar contraseña nueva")).not.toBeNull();
    expect(getByRole("list", { name: "Requisitos" }).textContent).toContain("(pendiente)");
  });

  it("only draws with token pairs from the shared contrast list", () => {
    const known = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of USED_PAIRS) expect(known.has(pair)).toBe(true);
  });

  it("uses no font weight above 600, no raw colors and no presentation style", () => {
    for (const file of SOURCES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/font-(bold|extrabold|black)\b/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      expect(source).not.toMatch(/StyleView|useStyle\(|style\s*===/);
    }
  });
});
