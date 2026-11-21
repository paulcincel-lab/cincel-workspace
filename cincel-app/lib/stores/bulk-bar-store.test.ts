import { beforeEach, describe, expect, it } from "vitest";

import { assistantButtonHiddenByBulkBar, resetBulkBar, useBulkBar } from "@/lib/stores/bulk-bar-store";

describe("bulk bar store (#1176)", () => {
  beforeEach(() => resetBulkBar());

  it("keeps the Chavita button visible with no bulk bar", () => {
    expect(assistantButtonHiddenByBulkBar(useBulkBar.getState().visible)).toBe(false);
  });

  it("hides it while any bulk bar is visible", () => {
    useBulkBar.getState().show();
    expect(assistantButtonHiddenByBulkBar(useBulkBar.getState().visible)).toBe(true);
  });

  it("counts several bars and shows the button again after the last one", () => {
    const { show, hide } = useBulkBar.getState();
    show();
    show();
    hide();
    expect(assistantButtonHiddenByBulkBar(useBulkBar.getState().visible)).toBe(true);
    hide();
    expect(assistantButtonHiddenByBulkBar(useBulkBar.getState().visible)).toBe(false);
  });

  it("never goes below zero", () => {
    useBulkBar.getState().hide();
    expect(useBulkBar.getState().visible).toBe(0);
  });
});
