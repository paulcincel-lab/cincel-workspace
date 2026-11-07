// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/lib/actions/projects-actions", () => ({
  fetchProjectAction: async () => ({ id: "p1", name: "Casa Roble" }),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ fetchTaskAction: async () => null }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffDetailAction: async () => null }));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: async () => [],
  fetchAssistantThreadAction: async () => {
    throw new Error("NOT_FOUND");
  },
}));

import { AssistantButton } from "../AssistantButton";
import { AssistantSheet } from "../AssistantSheet";
import { ConfirmationCard } from "../ConfirmationCard";
import { approvalRequest, uiMessageStream } from "./assistant-test-utils";
import { THEME_IDS } from "@/lib/ui/themes";

async function seriousViolations(container: Element) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide; the token
  // pairs are covered by CONTRAST_PAIRS / checkContrast (lib/ui/contrast.ts) in the presets test.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyTheme(themeId: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("data-theme-id", themeId);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

const MODES = ["light", "dark"] as const;

describe("assistant accessibility", () => {
  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      it(`sheet with a confirmation card has no serious axe violations (${themeId}, ${mode})`, async () => {
        applyTheme(themeId, mode);
        fetchMock.mockResolvedValueOnce(
          uiMessageStream(approvalRequest("a1", "create_note", { title: "Compras de obra" })),
        );
        render(
          <AssistantSheet
            open
            onOpenChange={vi.fn()}
            context={{ route: "/proyectos/p1", projectId: "p1" }}
          />,
        );
        expect(await screen.findByText("Viendo: Casa Roble")).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…"), {
          target: { value: "Crea una nota" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await screen.findByRole("button", { name: "Confirmar" });

        expect(await seriousViolations(document.body)).toEqual([]);
      });

      it(`button and card states have no serious axe violations (${themeId}, ${mode})`, async () => {
        applyTheme(themeId, mode);
        const { container } = render(
          <main>
            <AssistantButton onOpen={vi.fn()} />
            {(["approval-requested", "output-available", "output-denied", "output-error"] as const).map((state) => (
              <ConfirmationCard
                key={state}
                part={{
                  toolCallId: `call-${state}`,
                  toolName: "create_note",
                  input: { title: "Compras" },
                  state,
                  approvalId: `ap-${state}`,
                  errorText: state === "output-error" ? "FORBIDDEN" : undefined,
                }}
                onRespond={vi.fn()}
              />
            ))}
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
