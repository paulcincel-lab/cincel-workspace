// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import type { PresentationStyle } from "@/lib/types/redesign";

function branches() {
  return {
    visual: vi.fn(() => <p data-testid="branch">rama visual</p>),
    esencial: vi.fn(() => <p data-testid="branch">rama esencial</p>),
    analitico: vi.fn(() => <p data-testid="branch">rama analítica</p>),
  };
}

function setup(style: PresentationStyle, opts: { fixedByOrg?: boolean } = {}) {
  const fns = branches();
  const result = render(
    <StyleProvider style={style} scope="staff" fixedByOrg={opts.fixedByOrg}>
      <PageStyleLayout {...fns} />
    </StyleProvider>,
  );
  return { ...result, fns };
}

afterEach(() => {
  cleanup();
  nav.search = "";
});

describe("PageStyleLayout", () => {
  it("renders the visual branch in Visual", () => {
    setup("visual");
    expect(screen.getByTestId("branch").textContent).toBe("rama visual");
  });

  it("renders the esencial branch in Esencial", () => {
    setup("esencial");
    expect(screen.getByTestId("branch").textContent).toBe("rama esencial");
  });

  it("renders the analitico branch in Analítico", () => {
    setup("analitico");
    expect(screen.getByTestId("branch").textContent).toBe("rama analítica");
  });

  it("calls only the active branch function", () => {
    const { fns } = setup("esencial");
    expect(fns.esencial).toHaveBeenCalled();
    expect(fns.visual).not.toHaveBeenCalled();
    expect(fns.analitico).not.toHaveBeenCalled();
  });

  it("follows ?estilo=esencial on a staff page", () => {
    nav.search = "estilo=esencial";
    const { fns } = setup("visual");
    expect(screen.getByTestId("branch").textContent).toBe("rama esencial");
    expect(fns.visual).not.toHaveBeenCalled();
  });

  it("ignores ?estilo= when the organization fixed the style", () => {
    nav.search = "estilo=esencial";
    const { fns } = setup("visual", { fixedByOrg: true });
    expect(screen.getByTestId("branch").textContent).toBe("rama visual");
    expect(fns.esencial).not.toHaveBeenCalled();
  });

  it("adds no wrapper element", () => {
    const { container } = setup("analitico");
    expect(container.childElementCount).toBe(1);
    expect(container.firstChild).toBe(screen.getByTestId("branch"));
  });
});
