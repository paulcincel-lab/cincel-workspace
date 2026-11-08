// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  flags: { fetchMyPreferencesAction: false, updateMyPreferencesAction: false },
  update: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions/preferences-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: mocks.update,
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { StyleProvider, useStyle } from "@/components/shell/StyleProvider";
import { StyleView } from "@/components/widgets/StyleView";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { readEstiloOverride, resolvePageStyle } from "@/lib/ui/style-override";
import { THEME_PRESETS } from "@/lib/ui/themes";

/** What `updateMyPreferencesAction` answers for a saved style. */
function saved(style: PresentationStyle): { preferences: UserPreferences; appearance: ResolvedAppearance } {
  const preferences: UserPreferences = {
    theme: null,
    mode: "light",
    style,
    density: "comoda",
    textSize: 14,
    quietHours: null,
  };
  return { preferences, appearance: resolveAppearance({ ...THEME_PRESETS.azul, allowUserOverride: true, v: 1 }, preferences) };
}

const OVERRIDE_DISABLED_COPY = "La organización fijó el tema y el estilo. Pídele a un administrador que lo cambie.";

function Probe() {
  const { isOverridden } = useStyle();
  return (
    <>
      <span data-testid="overridden">{String(isOverridden)}</span>
      <StyleView
        visual={() => <p>vista visual</p>}
        esencial={() => <p>vista esencial</p>}
        analitico={() => <p>vista analítica</p>}
      />
    </>
  );
}

function setup(opts: {
  style?: PresentationStyle;
  scope?: "staff" | "portal";
  isOverridden?: boolean;
  fixedByOrg?: boolean;
} = {}) {
  return render(
    <StyleProvider
      style={opts.style ?? "visual"}
      scope={opts.scope ?? "staff"}
      isOverridden={opts.isOverridden}
      fixedByOrg={opts.fixedByOrg}
    >
      <EstiloSwitch scope={opts.scope} />
      <Probe />
    </StyleProvider>,
  );
}

function radio(name: string) {
  return screen.getByRole("radio", { name });
}

function clearPortalCookie() {
  document.cookie = "cincel-portal-style=; path=/; max-age=0";
}

beforeEach(() => {
  mocks.flags.updateMyPreferencesAction = false;
  mocks.update.mockReset();
  mocks.toastError.mockReset();
  clearPortalCookie();
});

afterEach(() => {
  clearPortalCookie();
});

describe("EstiloSwitch", () => {
  it("is a labelled radiogroup with Visual, Esencial and Analítico", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: "Estilo" });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Visual", "Esencial", "Analítico"]);
    expect(radio("Visual").getAttribute("aria-checked")).toBe("true");
    expect(radio("Esencial").getAttribute("aria-checked")).toBe("false");
  });

  it("has a single tab stop on the checked option", () => {
    setup({ style: "esencial" });
    expect(radio("Esencial").tabIndex).toBe(0);
    expect(radio("Visual").tabIndex).toBe(-1);
    expect(radio("Analítico").tabIndex).toBe(-1);
  });

  it("renders only the chosen style and switches it in place on click", () => {
    setup();
    expect(screen.getByText("vista visual")).toBeTruthy();
    expect(screen.queryByText("vista esencial")).toBeNull();
    expect(screen.queryByText("vista analítica")).toBeNull();

    fireEvent.click(radio("Analítico"));
    expect(radio("Analítico").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("vista analítica")).toBeTruthy();
    expect(screen.queryByText("vista visual")).toBeNull();
  });

  it("moves and selects with the arrow keys (wrapping), Home and End", () => {
    setup();
    radio("Visual").focus();
    fireEvent.keyDown(radio("Visual"), { key: "ArrowRight" });
    expect(radio("Esencial").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio("Esencial"));

    fireEvent.keyDown(radio("Esencial"), { key: "ArrowDown" });
    expect(radio("Analítico").getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(radio("Analítico"), { key: "ArrowRight" });
    expect(radio("Visual").getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(radio("Visual"), { key: "ArrowLeft" });
    expect(radio("Analítico").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("vista analítica")).toBeTruthy();

    fireEvent.keyDown(radio("Analítico"), { key: "Home" });
    expect(radio("Visual").getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(radio("Visual"), { key: "End" });
    expect(radio("Analítico").getAttribute("aria-checked")).toBe("true");
  });

  it("selects the focused option with Space", () => {
    setup();
    fireEvent.keyDown(radio("Esencial"), { key: " " });
    expect(radio("Esencial").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("vista esencial")).toBeTruthy();
  });

  it("is hidden in the staff shell when the organization fixed the style", () => {
    setup({ style: "esencial", fixedByOrg: true });
    expect(screen.queryByRole("radiogroup", { name: "Estilo" })).toBeNull();
    expect(screen.getByText("vista esencial")).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("is disabled with the OVERRIDE_DISABLED copy on the portal when the organization fixed the style", () => {
    setup({ style: "esencial", fixedByOrg: true, scope: "portal" });
    const group = screen.getByRole("radiogroup", { name: "Estilo" });
    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(group.getAttribute("title")).toBe(OVERRIDE_DISABLED_COPY);
    expect(screen.getByText(OVERRIDE_DISABLED_COPY)).toBeTruthy();
    for (const r of screen.getAllByRole("radio")) expect(r.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(radio("Visual"));
    fireEvent.keyDown(radio("Esencial"), { key: "ArrowRight" });
    expect(radio("Esencial").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("vista esencial")).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("shows the ?estilo= override as checked and isOverridden true", () => {
    const override = readEstiloOverride({ estilo: "analitico" });
    const page = resolvePageStyle({ override, chosen: "visual", styleDefault: "esencial", allowUserOverride: true });
    setup({ style: page.style, isOverridden: page.isOverridden });
    expect(radio("Analítico").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("overridden").textContent).toBe("true");
    expect(screen.getByText("vista analítica")).toBeTruthy();
  });

  it("does not persist a change while the ?estilo= override is active", () => {
    mocks.flags.updateMyPreferencesAction = true;
    setup({ style: "analitico", isOverridden: true });
    fireEvent.click(radio("Visual"));
    expect(screen.getByText("vista visual")).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("never calls the preferences write stub while it is not implemented", () => {
    setup();
    fireEvent.click(radio("Esencial"));
    expect(screen.getByText("vista esencial")).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("persists the staff style through updateMyPreferencesAction once implemented", async () => {
    mocks.flags.updateMyPreferencesAction = true;
    mocks.update.mockResolvedValue(saved("esencial"));
    setup();
    fireEvent.click(radio("Esencial"));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ style: "esencial" }));
    expect(radio("Esencial").getAttribute("aria-checked")).toBe("true");
    expect(document.cookie).not.toContain("cincel-portal-style=");
  });

  it("rolls back and shows the error copy when saving fails", async () => {
    mocks.flags.updateMyPreferencesAction = true;
    mocks.update.mockRejectedValue(new Error("OVERRIDE_DISABLED"));
    setup();
    await act(async () => {
      fireEvent.click(radio("Analítico"));
    });
    await waitFor(() => expect(radio("Visual").getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByText("vista visual")).toBeTruthy();
    expect(mocks.toastError).toHaveBeenCalledWith(OVERRIDE_DISABLED_COPY);
  });

  it('writes the cincel-portal-style cookie with scope="portal" and never calls the preferences action', () => {
    mocks.flags.updateMyPreferencesAction = true;
    setup({ scope: "portal" });
    fireEvent.click(radio("Esencial"));
    expect(document.cookie).toContain("cincel-portal-style=esencial");
    fireEvent.keyDown(radio("Esencial"), { key: "ArrowRight" });
    expect(document.cookie).toContain("cincel-portal-style=analitico");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("re-syncs with a new server style", () => {
    const { rerender } = setup({ style: "visual" });
    fireEvent.click(radio("Esencial"));
    rerender(
      <StyleProvider style="analitico" scope="staff" isOverridden>
        <EstiloSwitch />
        <Probe />
      </StyleProvider>,
    );
    expect(radio("Analítico").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("overridden").textContent).toBe("true");
  });
});
