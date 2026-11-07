import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => navigation);

import ConfiguracionWorkflowsPage from "./page";

describe("/configuracion/workflows", () => {
  it("redirects to /configuracion/tramos", () => {
    ConfiguracionWorkflowsPage();
    expect(navigation.redirect).toHaveBeenCalledWith("/configuracion/tramos");
  });
});
