// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import PortalLoginForm, { PORTAL_LINK_ENDPOINT, PORTAL_SEND_FAILED_MESSAGE } from "./PortalLoginForm";

const fetchMock = vi.fn();

function respond(status: number, body: unknown = {}) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

async function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PortalLoginForm", () => {
  it("requests a link and shows the Revisa tu correo state with the address", async () => {
    respond(200, { message: "Si tu correo tiene acceso, te enviamos un enlace." });
    render(<PortalLoginForm linkError={false} />);

    await submit("ana@example.com");

    expect(fetchMock).toHaveBeenCalledWith(
      PORTAL_LINK_ENDPOINT,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "ana@example.com" }) }),
    );
    expect(screen.getByText("Revisa tu correo")).toBeTruthy();
    expect(screen.getByText("Si tu correo tiene acceso, te enviamos un enlace.")).toBeTruthy();
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.queryByLabelText("Correo")).toBeNull();
  });

  it("prefills the email and goes back to the request state with Cambiar correo", async () => {
    respond(200);
    render(<PortalLoginForm linkError={false} initialEmail="ana@example.com" />);

    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@example.com");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar correo" }));

    expect(screen.getByText("Entra al portal")).toBeTruthy();
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("keeps Reenviar enlace disabled for 60 s, then resends to the same address", async () => {
    vi.useFakeTimers();
    respond(200);
    render(<PortalLoginForm linkError={false} />);
    await submit("ana@example.com");

    const countdown = screen.getByRole("button", { name: "Reenviar enlace en 60 s" }) as HTMLButtonElement;
    expect(countdown.disabled).toBe(true);

    for (let i = 0; i < 59; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect((screen.getByRole("button", { name: "Reenviar enlace en 1 s" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const resend = screen.getByRole("button", { name: "Reenviar enlace" }) as HTMLButtonElement;
    expect(resend.disabled).toBe(false);

    respond(200);
    await act(async () => {
      fireEvent.click(resend);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ body: JSON.stringify({ email: "ana@example.com" }) });
    expect(screen.getByRole("button", { name: "Reenviar enlace en 60 s" })).toBeTruthy();
  });

  it("shows the expired link message for ?error=link", () => {
    render(<PortalLoginForm linkError />);

    expect(screen.getByText("El enlace ya no es válido. Pide uno nuevo.")).toBeTruthy();
  });

  it("shows the rate limit message on 429 and stays on the request step", async () => {
    respond(429, { error: "rate_limited" });
    render(<PortalLoginForm linkError={false} />);

    await submit("ana@example.com");

    expect(screen.getByText("Demasiados intentos, espera unos minutos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeTruthy();
  });

  it("shows an invalid email message on 400 and a retry message on network errors", async () => {
    respond(400, { error: "invalid_email" });
    render(<PortalLoginForm linkError={false} />);
    await submit("ana@");
    expect(screen.getByText("Escribe un correo válido.")).toBeTruthy();

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await submit("ana@example.com");
    expect(screen.getByText(PORTAL_SEND_FAILED_MESSAGE)).toBeTruthy();
  });

  it("announces messages through an aria-live region", async () => {
    respond(429);
    render(<PortalLoginForm linkError={false} />);
    await submit("ana@example.com");

    const message = screen.getByText("Demasiados intentos, espera unos minutos.");
    expect(message.closest("[aria-live='polite']")).toBeTruthy();
  });
});
