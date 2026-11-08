// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";

// The photo button writes me.profile in the query cache; these tests render it without one.
vi.mock("@/components/shell/photo-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/photo-upload")>()),
  usePhotoUploadMutation: () => ({ mutateAsync: async () => "" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/page-data/inicio-actions", () => ({ getInicioPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/me-actions", () => ({ fetchMyProfileAction: vi.fn() }));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { InicioData, PresentationStyle, ThemeId } from "@/lib/types/redesign";

import { InicioClient } from "./InicioClient";
import { INICIO_EMPTY, INICIO_NON_ADMIN } from "./inicio-fixtures";

const MODES = ["light", "dark"] as const;
const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

/** The token pairs the Inicio page puts text and marks on (FE §14.6). */
const INICIO_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "destructive/background",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
  "chart-4/card",
]);

/** Applies a preset the way the root layout does: `<html>` attributes + one token block. */
function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
  const vars = Object.entries(THEME_PRESETS[theme].tokens)
    .map(([name, value]) => `--${name}: ${value[mode]};`)
    .join(" ");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
  document.head.appendChild(style);
}

async function seriousViolations() {
  const results = await axe.run(document.body, { resultTypes: ["violations"] });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderInicio(style: PresentationStyle, data: InicioData) {
  const client = createTestQueryClient();
  client.setQueryData(qk.inicio(), { inicio: data, firstLogin: { showGoogleSetupBanner: false } });
  client.setQueryData(qk.me.profile(), { id: "s-1", name: "Ana López", photoUrl: null });
  renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <InicioClient me={{ firstName: "Ana", name: "Ana López", role: "Arquitecta" }} now="2026-11-06T15:00:00Z" />
    </StyleProvider>,
    { client },
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

describe("Inicio accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it.each(STYLES)(`has no serious or critical axe violations (${theme}, ${mode}, %s)`, async (style) => {
        applyTheme(theme, mode);
        renderInicio(style, INICIO_NON_ADMIN);
        expect(await seriousViolations()).toEqual([]);
      });
    }

    it(`has no serious or critical axe violations when empty (${theme})`, async () => {
      applyTheme(theme, "light");
      renderInicio("visual", INICIO_EMPTY);
      expect(await seriousViolations()).toEqual([]);
    });
  }
});

describe("Inicio color pairs", () => {
  it("only uses pairs of CONTRAST_PAIRS", () => {
    const known = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of INICIO_PAIRS) expect(known.has(pair)).toBe(true);
  });

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`passes checkContrast for the pairs Inicio uses (${theme}, ${mode})`, () => {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => INICIO_PAIRS.has(r.pair) && !r.ok);
        expect(failing).toEqual([]);
      });
    }
  }
});
