// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedAppearance } from "@/lib/types/redesign";
import { APPEARANCE_COOKIE, serializeAppearanceCookie } from "@/lib/ui/preferences";

/**
 * `writeAppearanceCookie` (#1182): any cookie write in a Server Action makes
 * Next refresh the route, so an unchanged value is not written again.
 */
const state = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name)! } : undefined),
    set: state.set,
  }),
}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { writeAppearanceCookie } from "@/lib/ui/preferences-server";

const appearance = {
  theme: "azul",
  mode: "light",
  style: "visual",
  density: "comoda",
  textSize: "normal",
  version: 1,
} as unknown as ResolvedAppearance;

describe("writeAppearanceCookie", () => {
  beforeEach(() => {
    state.jar.clear();
    state.set.mockReset();
  });

  it("writes the cookie when the request has none", async () => {
    await writeAppearanceCookie(appearance);
    expect(state.set).toHaveBeenCalledWith(APPEARANCE_COOKIE, serializeAppearanceCookie(appearance), expect.any(Object));
  });

  it("writes the cookie when its value changes", async () => {
    state.jar.set(APPEARANCE_COOKIE, serializeAppearanceCookie({ ...appearance, mode: "dark" } as ResolvedAppearance));
    await writeAppearanceCookie(appearance);
    expect(state.set).toHaveBeenCalledTimes(1);
  });

  it("leaves an unchanged cookie alone", async () => {
    state.jar.set(APPEARANCE_COOKIE, serializeAppearanceCookie(appearance));
    await writeAppearanceCookie(appearance);
    expect(state.set).not.toHaveBeenCalled();
  });
});
