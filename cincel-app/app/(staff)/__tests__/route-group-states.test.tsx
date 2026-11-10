// @vitest-environment happy-dom
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/inicio" }));

vi.mock("@/components/shell/ErrorState", () => ({
  ErrorState: (props: { title?: string; onRetry?(): void }) => (
    <div data-testid="error-state">
      <p>{props.title}</p>
      <button type="button" onClick={() => props.onRetry?.()}>
        Reintentar
      </button>
    </div>
  ),
}));

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: ({ variant }: { variant: string }) => <div data-testid="skeleton" data-variant={variant} />,
}));

import StaffError from "../error";
import StaffLoading from "../loading";
import AdminError from "../ajustes/(admin)/error";
import AdminLoading from "../ajustes/(admin)/loading";
import PersonalError from "../ajustes/(personal)/error";
import PersonalLoading from "../ajustes/(personal)/loading";

const GROUP_DIRS = ["", "ajustes/(personal)", "ajustes/(admin)"];

const ERRORS = [
  ["(staff)", StaffError],
  ["(staff)/ajustes/(personal)", PersonalError],
  ["(staff)/ajustes/(admin)", AdminError],
] as const;

const LOADINGS = [
  ["(staff)", StaffLoading, "kpis"],
  ["(staff)/ajustes/(admin)", AdminLoading, "list"],
] as const;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("staff route groups", () => {
  it.each(GROUP_DIRS)("%s has error.tsx and loading.tsx", (dir) => {
    const base = join(__dirname, "..", dir);
    expect(existsSync(join(base, "error.tsx"))).toBe(true);
    expect(existsSync(join(base, "loading.tsx"))).toBe(true);
  });

  it.each(ERRORS)("%s error.tsx shows ErrorState and 'Reintentar' calls reset", (_name, ErrorPage) => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("boom")} reset={reset} />);
    expect(screen.getByTestId("error-state").textContent).toContain("No se pudo cargar esta página.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it.each(LOADINGS)("%s loading.tsx renders the matching skeleton", (_name, LoadingPage, variant) => {
    render(<LoadingPage />);
    expect(screen.getByTestId("skeleton").getAttribute("data-variant")).toBe(variant);
  });

  it("(staff)/ajustes/(personal) loading.tsx renders the settings-card skeleton", () => {
    render(<PersonalLoading />);
    const status = screen.getByRole("status", { name: "Cargando ajustes" });
    expect(status.getAttribute("data-variant")).toBe("settings");
    expect(status.getAttribute("aria-busy")).toBe("true");
  });
});
