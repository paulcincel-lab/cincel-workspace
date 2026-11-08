// @vitest-environment happy-dom
/**
 * `useStyle()` reads the `useAppearance` store (#974, zustand.md §2.6): the
 * style and `fixedByOrg` come from the store the root layout seeds, the
 * server HTML equals the first client render, a style change is seen by
 * every reader of the store, and the nested page `StyleProvider`s keep
 * working without a context of their own.
 */
import { act, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StyleProvider, useStyle } from "@/components/shell/StyleProvider";
import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";
import type { ResolvedAppearance, UserPreferences } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function resolved(patch: Partial<UserPreferences> = {}): ResolvedAppearance {
  return resolveAppearance(
    { ...THEME_PRESETS.azul, allowUserOverride: true, v: 1 },
    { theme: null, mode: "light", style: null, density: "comoda", textSize: 14, quietHours: null, ...patch },
  );
}

function Probe({ id }: { id: string }) {
  const { style, isFixed, isOverridden, scope } = useStyle();
  return <p data-testid={id}>{`${style}/${String(isFixed)}/${String(isOverridden)}/${scope}`}</p>;
}

function Switcher() {
  const { setStyle } = useStyle();
  return (
    <button type="button" onClick={() => setStyle("esencial")}>
      esencial
    </button>
  );
}

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("useStyle() reads the appearance store", () => {
  it("returns the store style and fixedByOrg; the first client render equals the server HTML", async () => {
    const initial = resolved({ style: "analitico" });
    const tree = (
      <AppearanceStoreProvider initial={initial} fixedByOrg>
        <Probe id="a" />
        {/* A page wrapper without an override passes through to the root store. */}
        <StyleProvider style="analitico" scope="staff">
          <Probe id="b" />
        </StyleProvider>
      </AppearanceStoreProvider>
    );
    const html = renderToString(tree);
    expect(html).toContain("analitico/true/false/staff");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recoverable = vi.fn();
    try {
      await act(async () => {
        root = hydrateRoot(container, tree, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
    expect(container.innerHTML).toBe(html);
  });

  it("SSR: two requests with different style and fixedByOrg never share a value", () => {
    const first = renderToString(
      <AppearanceStoreProvider initial={resolved({ style: "esencial" })} fixedByOrg>
        <Probe id="a" />
      </AppearanceStoreProvider>,
    );
    const second = renderToString(
      <AppearanceStoreProvider initial={resolved({ style: "visual" })}>
        <Probe id="a" />
      </AppearanceStoreProvider>,
    );
    expect(first).toContain("esencial/true/false/staff");
    expect(second).toContain("visual/false/false/staff");
  });

  it("a style change is seen by every reader of the store, including the page wrapper's children", () => {
    render(
      <AppearanceStoreProvider initial={resolved({ style: "visual" })}>
        <Probe id="shell" />
        <StyleProvider style="visual" scope="staff">
          <Probe id="page" />
          <Switcher />
        </StyleProvider>
      </AppearanceStoreProvider>,
    );
    act(() => screen.getByRole("button", { name: "esencial" }).click());
    expect(screen.getByTestId("shell").textContent).toBe("esencial/false/false/staff");
    expect(screen.getByTestId("page").textContent).toBe("esencial/false/false/staff");
  });

  it("a page ?estilo= override applies to its subtree only", () => {
    render(
      <AppearanceStoreProvider initial={resolved({ style: "visual" })}>
        <Probe id="shell" />
        <StyleProvider style="analitico" scope="staff" isOverridden>
          <Probe id="page" />
        </StyleProvider>
      </AppearanceStoreProvider>,
    );
    expect(screen.getByTestId("shell").textContent).toBe("visual/false/false/staff");
    expect(screen.getByTestId("page").textContent).toBe("analitico/false/true/staff");
  });

  it("fixedByOrg beats the ?estilo= override", () => {
    render(
      <AppearanceStoreProvider initial={resolved({ style: "visual" })} fixedByOrg>
        <StyleProvider style="analitico" scope="staff" isOverridden>
          <Probe id="page" />
        </StyleProvider>
      </AppearanceStoreProvider>,
    );
    expect(screen.getByTestId("page").textContent).toBe("visual/true/false/staff");
  });

  it("the portal wrapper seeds its cookie style and scope", () => {
    render(
      <AppearanceStoreProvider initial={resolved({ style: "visual" })}>
        <StyleProvider style="esencial" scope="portal">
          <Probe id="portal" />
        </StyleProvider>
      </AppearanceStoreProvider>,
    );
    expect(screen.getByTestId("portal").textContent).toBe("esencial/false/false/portal");
  });

  it("is Visual outside any store", () => {
    render(<Probe id="none" />);
    expect(screen.getByTestId("none").textContent).toBe("visual/false/false/staff");
  });
});
