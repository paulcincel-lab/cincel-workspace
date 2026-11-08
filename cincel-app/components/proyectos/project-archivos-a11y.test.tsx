// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/projects-actions", () => ({ retryProjectFolderAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

import { ProjectFiles } from "./ProjectFiles";

const MODES = ["light", "dark"] as const;
const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

/** The token pairs the Archivos tab paints text and marks with. */
const ARCHIVOS_PAIRS = [
  "foreground/background",
  "foreground/card",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
  "chart-4/card",
  "chart-5/card",
];

const OK: StaffFilesResult = {
  status: "ok",
  folderId: "root",
  breadcrumbs: [{ id: "root", name: "Casa Lomas" }],
  items: [
    {
      id: "f1",
      name: "01 Interno",
      mimeType: "application/vnd.google-apps.folder",
      sizeBytes: null,
      modifiedAt: "2026-11-03T17:40:00Z",
      iconLink: null,
      webViewLink: null,
      kind: "folder",
    },
    {
      id: "a",
      name: "Planta.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2_516_582,
      modifiedAt: "2026-11-03T17:40:00Z",
      iconLink: null,
      webViewLink: "https://drive.example/a",
      kind: "file",
    },
  ],
};

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide;
  // the token pairs are checked with checkContrast below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyAppearance(themeId: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", themeId);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

function renderTab(style: PresentationStyle, result: StaffFilesResult = OK) {
  // The folder states' Reintentar carpeta is a query mutation (5d, #962).
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <main>
        <ProjectFiles projectId="p1" result={result} canRetry />
      </main>
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("Archivos tab accessibility", () => {
  it("checks pairs that exist in CONTRAST_PAIRS", () => {
    const known = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    expect(ARCHIVOS_PAIRS.filter((p) => !known.has(p))).toEqual([]);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${themeId}, ${mode}, ${style})`, async () => {
          applyAppearance(themeId, mode);
          const { container } = renderTab(style);
          expect(await seriousViolations(container)).toEqual([]);
        });
      }

      it(`passes axe with the detail panel open and in the folder states (${themeId}, ${mode})`, async () => {
        applyAppearance(themeId, mode);
        const { container } = renderTab("visual");
        const details = screen.queryByRole("button", { name: "Detalles" });
        if (details) fireEvent.click(details);
        expect(await seriousViolations(container)).toEqual([]);
        cleanup();

        for (const result of [
          { status: "needs_consent" },
          { status: "no_drive_access" },
          { status: "failed", error: "quota" },
          { ...OK, items: [] },
        ] as StaffFilesResult[]) {
          const view = renderTab("esencial", result);
          expect(await seriousViolations(view.container)).toEqual([]);
          cleanup();
        }
      });

      it(`text and marks pass contrast (${themeId}, ${mode})`, () => {
        const results = checkContrast(THEME_PRESETS[themeId].tokens, mode).filter((r) => ARCHIVOS_PAIRS.includes(r.pair));
        expect(results).toHaveLength(ARCHIVOS_PAIRS.length);
        expect(results.filter((r) => !r.ok)).toEqual([]);
      });
    }
  }
});
