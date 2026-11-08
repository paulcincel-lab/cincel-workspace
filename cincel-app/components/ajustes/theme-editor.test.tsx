// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { OrgAppearance, ThemeId } from "@/lib/types/redesign";
import { THEME_IDS, THEME_LABELS, THEME_PRESETS } from "@/lib/ui/themes";
import { applyPreset } from "@/lib/ui/theme-editor";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  reset: vi.fn(),
  refresh: vi.fn(),
  flags: { fetchOrgAppearanceAction: true, saveOrgAppearanceAction: true, resetOrgAppearanceAction: true },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/org-appearance-actions", () => ({
  saveOrgAppearanceAction: mocks.save,
  resetOrgAppearanceAction: mocks.reset,
  fetchOrgAppearanceAction: vi.fn(),
}));
vi.mock("@/lib/actions/org-appearance-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));

// Contract-faithful pattern shells, so this file tests the editor and not the shells.
vi.mock("@/components/patterns/SettingsSection", () => ({
  SettingsSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock("@/components/patterns/SettingsRow", () => ({
  SettingsRow: (p: { label: string; description?: string; control: ReactNode; htmlFor?: string }) => (
    <div>
      <label htmlFor={p.htmlFor}>{p.label}</label>
      {p.description ? <span>{p.description}</span> : null}
      {p.control}
    </div>
  ),
}));
vi.mock("@/components/patterns/FormDialog", () => ({
  FormDialog: (p: {
    title: string;
    description?: string;
    open: boolean;
    onOpenChange(o: boolean): void;
    onSubmit(): Promise<void>;
    submitLabel: string;
    error?: string | null;
    children: ReactNode;
  }) =>
    p.open ? (
      <div role="dialog" aria-label={p.title}>
        <p>{p.description}</p>
        {p.children}
        {p.error ? <p role="alert">{p.error}</p> : null}
        <button type="button" onClick={() => p.onOpenChange(false)}>
          Cancelar
        </button>
        <button type="button" onClick={() => void p.onSubmit()}>
          {p.submitLabel}
        </button>
      </div>
    ) : null,
}));

import { ThemeEditor } from "./ThemeEditor";

const initial: OrgAppearance = THEME_PRESETS.azul;

function renderEditor(start: OrgAppearance = initial) {
  return render(<ThemeEditor initial={start} presets={THEME_PRESETS} />);
}

function preview(): HTMLElement {
  return screen.getByTestId("theme-preview");
}

function publishButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Publicar para todos" }) as HTMLButtonElement;
}

function tokenInput(name: string): HTMLInputElement {
  return document.getElementById(`token-${name}`) as HTMLInputElement;
}

beforeEach(() => {
  mocks.save.mockReset();
  mocks.save.mockImplementation(async (input: OrgAppearance) => input);
  mocks.reset.mockReset();
  mocks.refresh.mockReset();
  mocks.flags.saveOrgAppearanceAction = true;
  mocks.flags.resetOrgAppearanceAction = true;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThemeEditor live preview", () => {
  it("paints the preview with the edited token of the edited mode", () => {
    renderEditor();
    expect(preview().style.getPropertyValue("--primary")).toBe(initial.tokens.primary.light);

    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    expect(preview().style.getPropertyValue("--primary")).toBe("#1d4ed8");
    expect(tokenInput("primary").value).toBe("#1d4ed8");
  });

  it("edits the dark values after switching to Oscuro", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(preview().getAttribute("data-mode")).toBe("dark");
    expect(preview().style.getPropertyValue("--background")).toBe(initial.tokens.background.dark);

    fireEvent.change(tokenInput("background"), { target: { value: "#000000" } });
    expect(preview().style.getPropertyValue("--background")).toBe("#000000");

    fireEvent.click(screen.getByRole("radio", { name: "Claro" }));
    expect(preview().style.getPropertyValue("--background")).toBe(initial.tokens.background.light);
  });

  it("applies type roles and shape values to the preview", () => {
    renderEditor();
    const title = within(preview()).getByText("Buenos días");
    expect(title.style.fontSize).toBe(`${initial.typeScale.pageTitle.size}px`);

    fireEvent.change(document.getElementById("type-pageTitle") as HTMLInputElement, { target: { value: "30" } });
    expect(within(preview()).getByText("Buenos días").style.fontSize).toBe("30px");

    const radiusBefore = preview().style.getPropertyValue("--radius");
    fireEvent.change(document.getElementById("shape-radius") as HTMLInputElement, { target: { value: "4" } });
    expect(preview().style.getPropertyValue("--radius")).not.toBe(radiusBefore);

    fireEvent.change(document.getElementById("shape-card-padding") as HTMLInputElement, { target: { value: "8" } });
    expect(within(preview()).getByText("Requiere atención").parentElement?.style.padding).toBe("8px");

    fireEvent.click(screen.getByRole("radio", { name: "Marcada" }));
    fireEvent.click(publishButton());
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        typeScale: expect.objectContaining({ pageTitle: { ...initial.typeScale.pageTitle, size: 30 } }),
        shape: { ...initial.shape, radius: 4, cardPadding: 8, shadow: "marcada" },
      }),
    );
  });
});

describe("ThemeEditor contrast gate", () => {
  it("disables publishing and marks the rows while a pair fails", () => {
    renderEditor();
    expect(publishButton().disabled).toBe(false);
    expect(screen.getByRole("status").getAttribute("data-ok")).toBe("true");
    expect(screen.getByRole("status").textContent).toMatch(/Contraste texto \/ fondo: \d+\.\d:1 · cumple 4\.5:1/);

    fireEvent.change(tokenInput("muted-foreground"), { target: { value: "#c0c0c0" } });

    expect(publishButton().disabled).toBe(true);
    const row = document.querySelector('[data-token="muted-foreground"]');
    expect(row?.getAttribute("data-invalid")).toBe("true");
    expect(tokenInput("muted-foreground").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("status").getAttribute("data-ok")).toBe("false");
    expect(screen.getByRole("status").textContent).toContain("no cumple 4.5:1");
    expect(
      screen.getByText(/Algunos textos no se leerían bien \(contraste menor a 4\.5:1\)\. Ajusta los colores marcados\./),
    ).toBeTruthy();

    fireEvent.change(tokenInput("muted-foreground"), { target: { value: initial.tokens["muted-foreground"].light } });
    expect(publishButton().disabled).toBe(false);
    expect(document.querySelector('[data-token="muted-foreground"]')?.getAttribute("data-invalid")).toBeNull();
  });

  it("keeps publishing disabled when only the other mode fails", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    fireEvent.change(tokenInput("foreground"), { target: { value: initial.tokens.background.dark } });
    fireEvent.click(screen.getByRole("radio", { name: "Claro" }));

    expect(publishButton().disabled).toBe(true);
    expect(screen.getByText(/También hay colores marcados en el modo Oscuro\./)).toBeTruthy();
  });
});

describe("ThemeEditor presets", () => {
  it.each(THEME_IDS)("'Partir de' %s loads the preset into the draft and it publishes unchanged", async (id: ThemeId) => {
    renderEditor(THEME_PRESETS[id === "azul" ? "grafito" : "azul"]);

    const chip = screen.getByRole("button", { name: new RegExp(THEME_LABELS[id]) });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(preview().style.getPropertyValue("--background")).toBe(THEME_PRESETS[id].tokens.background.light);
    expect(publishButton().disabled).toBe(false);

    fireEvent.click(publishButton());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const start = THEME_PRESETS[id === "azul" ? "grafito" : "azul"];
    expect(mocks.save).toHaveBeenCalledWith(applyPreset(start, THEME_PRESETS[id]));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("keeps the organization style settings when a preset is applied", () => {
    renderEditor({ ...initial, styleDefault: "analitico", allowUserOverride: false });
    fireEvent.click(screen.getByRole("button", { name: /Grafito/ }));
    fireEvent.click(publishButton());
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ baseTheme: "grafito", styleDefault: "analitico", allowUserOverride: false }),
    );
  });

  it("binds the style cards and the organization checkbox", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: /Esencial/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Permitir que cada persona elija su estilo y tema" }));
    fireEvent.click(publishButton());
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        styleDefault: "esencial",
        allowUserOverride: !initial.allowUserOverride,
      }),
    );
  });
});

describe("ThemeEditor reset", () => {
  it("asks for confirmation before calling resetOrgAppearanceAction(base)", async () => {
    mocks.reset.mockResolvedValue(THEME_PRESETS.calido);
    renderEditor(THEME_PRESETS.calido);

    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    const dialog = screen.getByRole("dialog", { name: "¿Restablecer el tema?" });
    expect(mocks.reset).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restablecer" }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith("calido"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows FORBIDDEN in the dialog when the reset is refused", async () => {
    mocks.reset.mockRejectedValue(new Error("FORBIDDEN: appearance edit"));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restablecer" }));
    expect(await screen.findByText("No tienes permiso para realizar esta acción.")).toBeTruthy();
  });
});

describe("ThemeEditor export", () => {
  it("downloads the resolved :root and .dark blocks", async () => {
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return "blob:tema";
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderEditor();
    fireEvent.change(tokenInput("primary"), { target: { value: "#1d4ed8" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSS" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(blob).not.toBeNull();
    const css = await (blob as unknown as Blob).text();
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--primary: #1d4ed8;");
    expect(css).toContain(`--primary: ${initial.tokens.primary.dark};`);
  });
});

describe("ThemeEditor server errors", () => {
  it.each([
    ["FORBIDDEN: appearance edit", "No tienes permiso para realizar esta acción."],
    ["INVALID: tokens", "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo."],
    [
      "LOW_CONTRAST: foreground/background light 2.10",
      "Algunos textos no se leerían bien (contraste menor a 4.5:1). Ajusta los colores marcados.",
    ],
  ])("shows the copy of %s", async (message, copy) => {
    mocks.save.mockRejectedValue(new Error(message));
    renderEditor();
    await act(async () => {
      fireEvent.click(publishButton());
    });
    expect(await screen.findByText(copy)).toBeTruthy();
  });
});

describe("ThemeEditor entry points", () => {
  it("hides publish and reset while their actions are not implemented", () => {
    mocks.flags.saveOrgAppearanceAction = false;
    mocks.flags.resetOrgAppearanceAction = false;
    renderEditor();
    expect(screen.queryByRole("button", { name: "Publicar para todos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restablecer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Exportar CSS" })).toBeTruthy();
  });
});
