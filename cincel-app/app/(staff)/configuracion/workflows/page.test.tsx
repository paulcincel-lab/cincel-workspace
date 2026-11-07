import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/ui/legacy-redirects-server", () => ({ redirectLegacyIfRedesignOn: vi.fn(async () => {}) }));

import ConfiguracionWorkflowsPage from "./page";

describe("/configuracion/workflows", () => {
  it("redirects to /configuracion/tramos", async () => {
    await ConfiguracionWorkflowsPage({ searchParams: Promise.resolve({}) });
    expect(navigation.redirect).toHaveBeenCalledWith("/configuracion/tramos");
  });
});
