// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import axe from "axe-core";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const mondayActions = vi.hoisted(() => {
  const failed = async () => ({ ok: false as const, error: "No disponible en la prueba." });
  return {
    getMondayImportStatusAction: vi.fn(failed),
    openMondayImportRunAction: vi.fn(failed),
    getMondayImportRunAction: vi.fn(failed),
    saveMondayImportStepAction: vi.fn(failed),
    connectMondayAction: vi.fn(failed),
    startMondayExportAction: vi.fn(failed),
    getMondayExportSourceAction: vi.fn(failed),
    getMondayImportChoicesAction: vi.fn(failed),
    createMondayStaffAction: vi.fn(failed),
    saveMondayMappingDraftAction: vi.fn(failed),
    downloadMondayMappingAction: vi.fn(failed),
    uploadMondayMappingAction: vi.fn(failed),
    getMondayImportOptionsAction: vi.fn(failed),
    previewMondayImportAction: vi.fn(failed),
    startMondayApplyAction: vi.fn(failed),
    getMondayImportedProjectsAction: vi.fn(failed),
    checkMondayRollbackAction: vi.fn(failed),
    startMondayRollbackAction: vi.fn(failed),
    suggestMondayPositionAction: vi.fn(failed),
    saveMondayStatusMapAction: vi.fn(failed),
    getMondayRemapAction: vi.fn(failed),
    previewMondayRemapAction: vi.fn(failed),
    applyMondayRemapAction: vi.fn(failed),
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/actions/monday-import-actions", () => mondayActions);
vi.mock("@/lib/actions/onboarding-actions", () => ({ completeOnboardingAction: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/actions/task-statuses-actions", () => ({ createTaskStatusAction: vi.fn() }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({ getAjustesGooglePageData: vi.fn() }));
vi.mock("@/lib/actions/workspace-access-actions", () => ({
  createGroupMappingAction: vi.fn(),
  updateGroupMappingAction: vi.fn(),
  deleteGroupMappingAction: vi.fn(),
}));

import { GoogleSetupWizard } from "./GoogleSetupWizard";
import { MondayImportWizard } from "./monday-import/MondayImportWizard";
import { WIZARD_STEPPER_CONTRAST_PAIRS } from "./WizardStepper";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import type { MondayImportRunState } from "@/lib/types/monday-import";
import type { GoogleHealth } from "@/lib/types/workspace-access";
import type { ThemeId } from "@/lib/types/redesign";

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

/** What the root layout puts on `<html>` (FE §4.1), with the preset's tokens as CSS variables. */
function applyTheme(theme: ThemeId, mode: Mode) {
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.setAttribute("data-theme-id", theme);
  root.classList.toggle("dark", mode === "dark");
  for (const token of TOKEN_NAMES) root.style.setProperty(`--${token}`, THEME_PRESETS[theme].tokens[token][mode]);
}

function resetTheme() {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("data-theme-id");
  root.classList.remove("dark");
  root.removeAttribute("style");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide; the token pairs are checked
  // with `checkContrast` below instead.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.html) }));
}

const health: GoogleHealth = {
  workspaceDomain: "example.test",
  oauthClientConfigured: true,
  groupMappingCount: 0,
  roleGroupMappingCount: 0,
  serviceAccountEmail: "directory@fake.iam.gserviceaccount.com",
  sharedDriveId: null,
  tokenKeyConfigured: true,
  lastDirectoryError: null,
  lastDriveError: null,
  googleLinkedStaff: 0,
  activeStaff: 1,
};

/** An export still running: the wizard opens on Tableros, with Conectar done. */
const exportingRun: MondayImportRunState = {
  runId: "r1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  step: "tableros",
  account: null,
  boardIds: [],
  exportOptions: { updates: true, files: false },
  exported: false,
  mapping: null,
  jobs: {
    export: {
      kind: "export",
      status: "running",
      startedAt: "2026-11-01T00:00:00.000Z",
      finishedAt: null,
      progress: { done: 1, total: 4, label: "Exportando de monday" },
      log: [],
      notes: [],
      error: null,
    },
  },
  batchId: null,
  batchStatus: null,
};

/** The wizard with `ajustes.page('google')` hydrated, as the primeros-pasos page leaves it. */
function renderGoogle() {
  const client = createTestQueryClient();
  client.setQueryData(qk.ajustes.page("google"), { health, mappings: [], positions: [] });
  return renderWithQueryClient(<GoogleSetupWizard />, { client });
}

/** The page reads the run; "Continuar importación" opens it and shows the stepper. */
async function renderMonday() {
  mondayActions.openMondayImportRunAction.mockResolvedValueOnce({ ok: true, run: exportingRun } as never);
  const result = renderWithQueryClient(
    <MondayImportWizard latestRun={exportingRun} hasServerToken={false} loadError={null} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Continuar importación" }));
  await screen.findByRole("list", { name: "Pasos" });
  return result;
}

function stepItems() {
  return within(screen.getByRole("list", { name: "Pasos" })).getAllByRole("listitem");
}

afterEach(() => {
  cleanup();
  resetTheme();
});

describe("first-login wizards: stepper", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`Google primeros pasos has no serious axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = renderGoogle();
        const items = stepItems();
        expect(items.map((item) => item.dataset.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
        const current = items.filter((item) => item.getAttribute("aria-current") === "step");
        expect(current).toHaveLength(1);
        expect(current[0].textContent).toContain("Grupo de administradores");
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`Importar de monday has no serious axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = await renderMonday();
        const items = stepItems();
        expect(items).toHaveLength(7);
        expect(items.map((item) => item.dataset.state)).toEqual([
          "done",
          "current",
          "upcoming",
          "upcoming",
          "upcoming",
          "upcoming",
          "upcoming",
        ]);
        const current = items.filter((item) => item.getAttribute("aria-current") === "step");
        expect(current).toHaveLength(1);
        expect(current[0].textContent).toContain("Tableros");
        expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});

describe("first-login wizards: stepper colors", () => {
  it("paints text only with pairs of lib/ui/contrast.ts", () => {
    const known = new Set(CONTRAST_PAIRS.map((pair) => pair.pair));
    for (const pair of WIZARD_STEPPER_CONTRAST_PAIRS) expect(known.has(pair)).toBe(true);
  });

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`every stepper pair passes in ${theme} ${mode}`, () => {
        const results = checkContrast(THEME_PRESETS[theme].tokens, mode);
        const failing = results.filter(
          (result) => (WIZARD_STEPPER_CONTRAST_PAIRS as readonly string[]).includes(result.pair) && !result.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }
});

describe("first-login wizards: guard (FE §15.3, §18 items 12 and 15)", () => {
  const files = [
    "components/configuracion/WizardStepper.tsx",
    "components/configuracion/GoogleSetupWizard.tsx",
    "components/configuracion/monday-import/MondayImportWizard.tsx",
  ];

  for (const file of files) {
    it(`${file} ignores the presentation style and stays at weight 600 or below`, () => {
      const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
      expect(source).not.toMatch(/StyleView|StyleProvider|useStyle\b|EstiloSwitch/);
      expect(source).not.toMatch(/\bstyle\s*===/);
      expect(source).not.toMatch(/\bfont-(bold|extrabold|black)\b/);
      // Color only from tokens: no arbitrary color utilities.
      expect(source).not.toMatch(/\b(bg|text|border|ring)-\[/);
    });
  }
});
