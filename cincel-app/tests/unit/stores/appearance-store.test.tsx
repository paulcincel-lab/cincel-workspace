// @vitest-environment happy-dom
/**
 * `useAppearance` store (#954, zustand.md §2.6; redesign FE §4.1): the same
 * behaviour as the `AppearanceProvider` context it replaces. Attributes,
 * classes and the `<style id="appearance">` block only; optimistic with
 * rollback and an error toast; text size debounced 300 ms.
 */
import { Component, useEffect, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { actionErrorText } from "@/lib/errors";
import type { ResolvedAppearance, TextSize, UserPreferences } from "@/lib/types/redesign";
import { appearanceStyleBlock } from "@/lib/ui/appearance-css";
import { resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

import { qk } from "@/lib/query/keys";
import { resetUiStores, setBrowserQueryClient } from "@/lib/query/reset-client-state";
import {
  AppearanceStoreProvider as AppearanceProvider,
  createAppearanceStore,
  TEXT_SIZE_DEBOUNCE_MS,
  useAppearance,
} from "@/lib/stores/appearance-store";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  toastError: vi.fn(),
  flags: { fetchMyPreferencesAction: false, updateMyPreferencesAction: false },
}));

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: mocks.update,
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/preferences-actions.flags", () => ({ IMPLEMENTED: mocks.flags }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

function resolved(patch: Partial<UserPreferences> = {}, theme: keyof typeof THEME_PRESETS = "azul"): ResolvedAppearance {
  return resolveAppearance(
    { ...THEME_PRESETS.azul, allowUserOverride: true, v: 1 },
    {
      theme: theme === "azul" ? null : theme,
      mode: "light",
      style: null,
      density: "comoda",
      textSize: 14,
      quietHours: null,
      ...patch,
    },
  );
}

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  render() {
    return this.state.message ? <p role="alert">{this.state.message}</p> : this.props.children;
  }
}

type SetPreference = (patch: Partial<UserPreferences>) => Promise<void>;
const probeHandle: { setPreference: SetPreference } = { setPreference: async () => undefined };
const setPreference: SetPreference = (patch) => probeHandle.setPreference(patch);

function Probe() {
  const appearance = useAppearance();
  useEffect(() => {
    probeHandle.setPreference = appearance.setPreference;
  }, [appearance.setPreference]);
  return (
    <p data-testid="probe">
      {appearance.appearance.theme}/{appearance.appearance.mode}/{appearance.appearance.textSize}
    </p>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function prepareDocument(initial: ResolvedAppearance) {
  const root = document.documentElement;
  for (const name of ["data-theme", "data-mode", "data-theme-id", "data-style", "data-density", "style"]) {
    root.removeAttribute(name);
  }
  root.className = "";
  root.setAttribute("data-theme", initial.mode === "dark" ? "dark" : "light");
  root.setAttribute("data-mode", initial.mode);
  document.getElementById("appearance")?.remove();
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = appearanceStyleBlock(initial.cssVars);
  document.head.appendChild(style);
}

const root = () => document.documentElement;
const styleBlock = () => document.getElementById("appearance")?.textContent ?? "";

describe("useAppearance store", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.toastError.mockReset();
    mocks.flags.updateMyPreferencesAction = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("useAppearance throws outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <Boundary>
        <Probe />
      </Boundary>,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/AppearanceStoreProvider/);
    spy.mockRestore();
  });

  it("exposes the initial appearance", () => {
    const initial = resolved();
    prepareDocument(initial);
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("azul/light/14");
  });

  it("applies a mode change before the action answers, with data-theme and .dark together", async () => {
    const initial = resolved();
    prepareDocument(initial);
    const call = deferred<{ preferences: UserPreferences; appearance: ResolvedAppearance }>();
    mocks.update.mockReturnValue(call.promise);
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );

    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = setPreference({ mode: "dark" });
    });
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().classList.contains("dark")).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ mode: "dark" });

    const next = resolved({ mode: "dark" });
    await act(async () => {
      call.resolve({ preferences: {} as UserPreferences, appearance: next });
      await done;
    });
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(screen.getByTestId("probe").textContent).toBe("azul/dark/14");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("swaps the style block with the vars the action returns on a theme change", async () => {
    const initial = resolved();
    prepareDocument(initial);
    const next = resolved({ theme: "grafito" }, "grafito");
    mocks.update.mockResolvedValue({ preferences: {} as UserPreferences, appearance: next });
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );

    await act(async () => {
      await setPreference({ theme: "grafito" });
    });
    expect(root().getAttribute("data-theme-id")).toBe("grafito");
    expect(styleBlock()).toBe(appearanceStyleBlock(next.cssVars));
    expect(styleBlock()).toContain(`--sidebar:${THEME_PRESETS.grafito.tokens.sidebar.light}`);
    expect(document.querySelectorAll("style#appearance")).toHaveLength(1);
  });

  it("rolls back and shows the error toast when the action fails", async () => {
    const initial = resolved();
    prepareDocument(initial);
    const error = new Error("OVERRIDE_DISABLED: theme");
    mocks.update.mockRejectedValue(error);
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );

    await act(async () => {
      await setPreference({ theme: "calido", mode: "dark" });
    });
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().classList.contains("dark")).toBe(false);
    expect(root().getAttribute("data-theme-id")).toBe("azul");
    expect(styleBlock()).toBe(appearanceStyleBlock(initial.cssVars));
    expect(screen.getByTestId("probe").textContent).toBe("azul/light/14");
    expect(mocks.toastError).toHaveBeenCalledWith(actionErrorText(error));
    expect(mocks.toastError.mock.calls[0][0]).toBe(
      "La organización fijó el tema y el estilo. Pídele a un administrador que lo cambie.",
    );
  });

  it("debounces text-size changes by 300 ms and sends only the last one", async () => {
    vi.useFakeTimers();
    const initial = resolved();
    prepareDocument(initial);
    mocks.update.mockImplementation(async (patch: { textSize: TextSize }) => ({
      preferences: {} as UserPreferences,
      appearance: resolved({ textSize: patch.textSize }),
    }));
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );

    act(() => {
      void setPreference({ textSize: 14.5 });
    });
    expect(root().classList.contains("text-size-14-5")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(TEXT_SIZE_DEBOUNCE_MS - 50);
      void setPreference({ textSize: 15 });
      void setPreference({ textSize: 15.5 });
    });
    expect(root().classList.contains("text-size-15-5")).toBe(true);
    expect(root().classList.contains("text-size-14-5")).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(TEXT_SIZE_DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ textSize: 15.5 });
  });

  it("never writes variables on documentElement.style", async () => {
    const initial = resolved();
    prepareDocument(initial);
    mocks.update.mockResolvedValue({ preferences: {} as UserPreferences, appearance: resolved({ mode: "dark", density: "compacta" }) });
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );
    await act(async () => {
      await setPreference({ mode: "dark", density: "compacta" });
    });
    expect(root().getAttribute("style")).toBeNull();
    expect(root().style.length).toBe(0);
    expect(root().getAttribute("data-density")).toBe("compacta");
  });

  it("follows the OS in system mode", () => {
    const listeners: Array<() => void> = [];
    let matches = false;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const initial = resolved({ mode: "system" });
      prepareDocument(initial);
      render(
        <AppearanceProvider initial={initial}>
          <Probe />
        </AppearanceProvider>,
      );
      matches = true;
      act(() => {
        for (const listener of listeners) listener();
      });
      expect(root().getAttribute("data-theme")).toBe("dark");
      expect(root().classList.contains("dark")).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });

  it("never reads the retired cincel.theme key nor writes a preference from it", async () => {
    mocks.flags.updateMyPreferencesAction = true;
    window.localStorage.setItem("cincel.theme", "dark");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const initial = resolved({ mode: "system" });
    prepareDocument(initial);
    await act(async () => {
      render(
        <AppearanceProvider initial={initial}>
          <Probe />
        </AppearanceProvider>,
      );
      await Promise.resolve();
    });
    expect(getItem.mock.calls.map(([key]) => key)).not.toContain("cincel.theme");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("cincel.theme")).toBe("dark");
    getItem.mockRestore();
  });

  it("re-renders a selector only when its slice changes", async () => {
    const initial = resolved();
    prepareDocument(initial);
    mocks.update.mockResolvedValue({ preferences: {} as UserPreferences, appearance: resolved({ density: "compacta" }) });
    const onRender = vi.fn();
    function ModeProbe() {
      const mode = useAppearance((s) => s.appearance.mode);
      onRender();
      return <p data-testid="mode">{mode}</p>;
    }
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
        <ModeProbe />
      </AppearanceProvider>,
    );
    const before = onRender.mock.calls.length;
    await act(async () => {
      await setPreference({ density: "compacta" });
    });
    expect(onRender).toHaveBeenCalledTimes(before);
    expect(screen.getByTestId("mode").textContent).toBe("light");
  });

  it("does not write the document when the store is created", () => {
    const initial = resolved({ mode: "dark", density: "compacta" });
    prepareDocument(resolved());
    createAppearanceStore(initial);
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().getAttribute("data-density")).toBeNull();
    expect(root().classList.contains("dark")).toBe(false);
  });

  it("a new server appearance replaces the shown one", () => {
    const initial = resolved();
    prepareDocument(initial);
    const view = render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );
    act(() => {
      view.rerender(
        <AppearanceProvider initial={resolved({ mode: "dark" }, "grafito")}>
          <Probe />
        </AppearanceProvider>,
      );
    });
    expect(screen.getByTestId("probe").textContent).toBe("grafito/dark/14");
  });

  it("exposes fixedByOrg from the provider (false by default)", () => {
    const initial = resolved();
    prepareDocument(initial);
    function FixedProbe() {
      return <p data-testid="fixed">{String(useAppearance((s) => s.fixedByOrg))}</p>;
    }
    const view = render(
      <AppearanceProvider initial={initial}>
        <FixedProbe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("fixed").textContent).toBe("false");
    view.unmount();
    render(
      <AppearanceProvider initial={initial} fixedByOrg>
        <FixedProbe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("fixed").textContent).toBe("true");
  });

  it("accepts an ActionResult from the action and rolls back on { ok: false }", async () => {
    const initial = resolved();
    prepareDocument(initial);
    const next = resolved({ mode: "dark" });
    mocks.update.mockResolvedValueOnce({ ok: true, data: { preferences: {} as UserPreferences, appearance: next } });
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );
    await act(async () => {
      await setPreference({ mode: "dark" });
    });
    expect(screen.getByTestId("probe").textContent).toBe("azul/dark/14");

    mocks.update.mockResolvedValueOnce({ ok: false, error: "OVERRIDE_DISABLED" });
    await act(async () => {
      await setPreference({ theme: "calido" });
    });
    expect(screen.getByTestId("probe").textContent).toBe("azul/dark/14");
    expect(root().getAttribute("data-theme-id")).toBe("azul");
    expect(mocks.toastError).toHaveBeenCalledWith(actionErrorText(new Error("OVERRIDE_DISABLED")));
  });

  it("writes the saved preferences into the query cache", async () => {
    const queryClient = new QueryClient();
    setBrowserQueryClient(queryClient);
    try {
      const initial = resolved();
      prepareDocument(initial);
      const preferences = { mode: "dark" } as UserPreferences;
      mocks.update.mockResolvedValue({ preferences, appearance: resolved({ mode: "dark" }) });
      render(
        <AppearanceProvider initial={initial}>
          <Probe />
        </AppearanceProvider>,
      );
      await act(async () => {
        await setPreference({ mode: "dark" });
      });
      expect(queryClient.getQueryData(qk.me.preferences())).toBe(preferences);
    } finally {
      setBrowserQueryClient(null);
      queryClient.clear();
    }
  });

  it("resetClientState drops a queued text-size save and shows the confirmed appearance", async () => {
    vi.useFakeTimers();
    const initial = resolved();
    prepareDocument(initial);
    render(
      <AppearanceProvider initial={initial}>
        <Probe />
      </AppearanceProvider>,
    );
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = setPreference({ textSize: 16 });
    });
    expect(root().classList.contains("text-size-16")).toBe(true);

    act(() => {
      resetUiStores();
    });
    await act(async () => {
      vi.advanceTimersByTime(TEXT_SIZE_DEBOUNCE_MS * 2);
      await done;
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(root().classList.contains("text-size-16")).toBe(false);
    expect(root().classList.contains("text-size-14")).toBe(true);
    expect(screen.getByTestId("probe").textContent).toBe("azul/light/14");
  });
});
