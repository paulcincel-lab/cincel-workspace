// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));

const sheetModuleLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/components/asistente/AssistantSheet", () => {
  sheetModuleLoads.count += 1;
  return {
    AssistantSheet: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Asistente" /> : null),
  };
});

import { AssistantLauncher } from "../AssistantLauncher";

afterEach(cleanup);

/**
 * Issue #916: the sheet's tree (chat SDK, markdown, charts) stays out of every
 * staff page's first load and is fetched on first hover, focus or open.
 */
describe("AssistantLauncher lazy sheet", () => {
  it("does not load the sheet module on render; hover starts loading it and opening shows it", async () => {
    render(<AssistantLauncher enabled />);
    const button = screen.getByRole("button", { name: /Pregúntale a Cincel/ });
    expect(sheetModuleLoads.count).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.pointerEnter(button);
    await vi.waitFor(() => expect(sheetModuleLoads.count).toBe(1));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "Asistente" })).toBeTruthy();
    expect(sheetModuleLoads.count).toBe(1);
  });
});
