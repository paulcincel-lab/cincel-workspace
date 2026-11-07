import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

import NotaLinkPage from "./page";

describe("/mi-espacio/notas/[id] canonical link", () => {
  it("redirects to /mi-espacio?nota=<id>", async () => {
    await expect(NotaLinkPage({ params: Promise.resolve({ id: "note-9" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/mi-espacio?nota=note-9",
    );
    expect(navigation.redirect).toHaveBeenLastCalledWith("/mi-espacio?nota=note-9");
  });

  it("encodes the id in the query string", async () => {
    await expect(NotaLinkPage({ params: Promise.resolve({ id: "x/y" }) })).rejects.toThrow();
    expect(navigation.redirect).toHaveBeenLastCalledWith("/mi-espacio?nota=x%2Fy");
  });
});
