// @vitest-environment happy-dom
/**
 * "Ocultar completadas" preference (#1039): read from the appearance store's
 * preferences, saved optimistically with `updateMyPreferencesAction`, rolled
 * back on error; outside the provider it reads the default.
 */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceStoreProvider, useHideCompletedPreference } from "@/lib/stores/appearance-store";
import type { UserPreferences } from "@/lib/types/redesign";
import { resolveAppearance, DEFAULT_USER_PREFERENCES } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

const mocks = vi.hoisted(() => ({ update: vi.fn(), toastError: vi.fn() }));

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: mocks.update,
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

const appearance = resolveAppearance({ ...THEME_PRESETS.azul, allowUserOverride: true, v: 1 }, null);

function wrapper(preferences: UserPreferences) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppearanceStoreProvider initial={appearance} preferences={preferences}>
        {children}
      </AppearanceStoreProvider>
    );
  };
}

describe("useHideCompletedPreference", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.toastError.mockReset();
  });

  it("is off by default and off outside the provider", () => {
    expect(renderHook(() => useHideCompletedPreference()).result.current[0]).toBe(false);
    const { result } = renderHook(() => useHideCompletedPreference(), { wrapper: wrapper({ ...DEFAULT_USER_PREFERENCES }) });
    expect(result.current[0]).toBe(false);
  });

  it("reads the seeded preference", () => {
    const { result } = renderHook(() => useHideCompletedPreference(), {
      wrapper: wrapper({ ...DEFAULT_USER_PREFERENCES, hideCompletedTasks: true }),
    });
    expect(result.current[0]).toBe(true);
  });

  it("saves the change optimistically with updateMyPreferencesAction", async () => {
    mocks.update.mockResolvedValue({
      ok: true,
      data: { preferences: { ...DEFAULT_USER_PREFERENCES, hideCompletedTasks: true }, appearance },
    });
    const { result } = renderHook(() => useHideCompletedPreference(), { wrapper: wrapper({ ...DEFAULT_USER_PREFERENCES }) });
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    await act(async () => undefined);
    expect(mocks.update).toHaveBeenCalledWith({ hideCompletedTasks: true });
    expect(result.current[0]).toBe(true);
  });

  it("rolls back when the save fails", async () => {
    mocks.update.mockResolvedValue({ ok: false, error: "INVALID" });
    const { result } = renderHook(() => useHideCompletedPreference(), { wrapper: wrapper({ ...DEFAULT_USER_PREFERENCES }) });
    act(() => result.current[1](true));
    await act(async () => undefined);
    expect(result.current[0]).toBe(false);
    expect(mocks.toastError).toHaveBeenCalled();
  });
});
