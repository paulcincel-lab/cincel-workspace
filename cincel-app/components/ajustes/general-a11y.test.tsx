// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/components/patterns/SettingsSection", async () => ({
  SettingsSection: (await import("./general-settings-test-utils")).TestSettingsSection,
}));
vi.mock("@/components/patterns/SettingsRow", async () => ({
  SettingsRow: (await import("./general-settings-test-utils")).TestSettingsRow,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/page-data/ajustes-actions", () => ({ getAjustesGeneralPageData: vi.fn() }));
vi.mock("@/lib/actions/app-settings-actions", () => ({
  saveGeneralSettingsAction: vi.fn(),
  restoreGeneralSettingsAction: vi.fn(),
}));

import { AjustesGeneralClient } from "./AjustesGeneralClient";
import { GeneralLinksSection } from "./GeneralLinksSection";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { buildDefaultLoadedGeneralSettings } from "@/lib/settings/general-settings";
import { THEME_IDS } from "@/lib/ui/themes";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function renderPage() {
  const client = createTestQueryClient();
  client.setQueryData(qk.org.general(), buildDefaultLoadedGeneralSettings());
  client.setQueryData(qk.ajustes.page("general"), { canManage: true, canManageAppearance: true });
  return renderWithQueryClient(
    <AjustesGeneralClient>
      <GeneralLinksSection />
    </AjustesGeneralClient>,
    { client },
  );
}

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("data-theme-id");
  root.classList.remove("dark");
});

describe("Ajustes › General accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        const root = document.documentElement;
        root.setAttribute("data-theme", mode);
        root.setAttribute("data-theme-id", theme);
        root.classList.toggle("dark", mode === "dark");

        const { container } = renderPage();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }

  it("stays clean with inline link errors shown", async () => {
    const { container } = renderPage();
    fireEvent.change(screen.getByLabelText("Instagram"), { target: { value: "instagram.com" } });
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "hola@" } });

    expect(await seriousViolations(container)).toEqual([]);
  });
});
