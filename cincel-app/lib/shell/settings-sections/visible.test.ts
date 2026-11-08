import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

import { visibleSettingsSections } from "./visible";

const Empty = () => null;
const user = { id: "u1" } as unknown as AuthenticatedUser;

function entry(name: string, order: number, visible: boolean): SettingsSectionEntry {
  return { page: "apariencia", name, order, visible: () => visible, Component: Empty };
}

describe("visibleSettingsSections", () => {
  it("keeps the visible sections sorted by order without mutating the list", () => {
    const list = [entry("c", 30, true), entry("a", 10, true), entry("b", 20, false)];
    expect(visibleSettingsSections(list, user).map((s) => s.name)).toEqual(["a", "c"]);
    expect(list.map((s) => s.name)).toEqual(["c", "a", "b"]);
  });
});
