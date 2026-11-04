// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import PortalAccessPage, { metadata } from "./page";

const TOKEN = "a".repeat(64);

afterEach(cleanup);

describe("/portal/acceder", () => {
  it("renders a form that posts the token to the verify route only when the button is pressed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(await PortalAccessPage({ searchParams: Promise.resolve({ token: TOKEN }) }));

    const button = screen.getByRole("button", { name: "Entrar al portal" });
    const form = button.closest("form") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/portal/auth/verify");
    expect((form.querySelector("input[name='token']") as HTMLInputElement).value).toBe(TOKEN);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("shows the invalid link message and a way back without a token", async () => {
    render(await PortalAccessPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("button", { name: "Entrar al portal" })).toBeNull();
    expect(screen.getByText("El enlace ya no es válido. Pide uno nuevo.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).getAttribute("href")).toBe("/portal/login");
  });

  it("keeps the token out of the Referer", () => {
    expect(metadata.referrer).toBe("no-referrer");
  });
});
