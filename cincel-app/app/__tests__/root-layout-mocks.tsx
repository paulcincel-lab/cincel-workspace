/**
 * Module doubles shared by the root-layout tests. Each test file wires them
 * with `vi.mock(path, async () => (await import("./root-layout-mocks")).<name>)`.
 * Only the appearance pipeline is under test, so the providers pass their
 * children through and the session has no user.
 */
import type { ReactNode } from "react";
import { vi } from "vitest";

import type { ResolvedAppearance, ThemeId, UserPreferences } from "@/lib/types/redesign";
import { resolveAppearance } from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

function Passthrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function fontFactory(options: { variable: string }) {
  return { variable: `font${options.variable}`, className: `font-class${options.variable}`, style: { fontFamily: "x" } };
}

export const fontMock = { Geist: fontFactory, Geist_Mono: fontFactory, Inter: fontFactory, DM_Sans: fontFactory };

export const passthroughDefaultMock = { default: Passthrough };
export const hydratorMock = { default: () => null };
export const sessionMock = { getSessionAccess: vi.fn(async () => ({ user: null })) };
export const generalSettingsMock = { buildDefaultLoadedGeneralSettings: () => ({ settings: {}, hasCustom: false, savedAt: null }) };
export const generalSettingsServerMock = { getGeneralSettings: vi.fn(async () => ({ settings: {} })) };
export const useGeneralSettingsMock = { GeneralSettingsSeed: Passthrough };
export const cssMock = {};

/** What `getResolvedAppearance` returns; tests set it. */
export const appearanceState: { value: ResolvedAppearance | null } = { value: null };
/** The org's `allowUserOverride` that `getStoredOrgAppearance` returns; tests set it. */
export const orgPolicyState = { allowUserOverride: true };
export const preferencesServerMock = {
  getResolvedAppearance: vi.fn(async () => {
    if (!appearanceState.value) throw new Error("appearanceState.value not set");
    return appearanceState.value;
  }),
  getStoredOrgAppearance: vi.fn(async () => ({
    ...THEME_PRESETS.azul,
    allowUserOverride: orgPolicyState.allowUserOverride,
    v: 1,
  })),
};

export const preferencesActionsMock = {
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
};

export const toasterMock = {
  Toaster: ({ position, offset }: { position?: string; offset?: number }) => (
    <div data-testid="toaster" data-position={position} data-offset={String(offset)} />
  ),
};

/** A resolved appearance for an org on `theme` and a user with `patch`. */
export function appearanceFor(theme: ThemeId, patch: Partial<UserPreferences> = {}): ResolvedAppearance {
  return resolveAppearance(
    { ...THEME_PRESETS[theme], v: 1 },
    {
      theme: null,
      mode: "system",
      style: null,
      density: "comoda",
      textSize: 14,
      quietHours: null,
      ...patch,
    },
  );
}
