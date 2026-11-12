// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { resetCalendarioUi } from "@/lib/stores/calendario-ui-store";

import { GoogleConnectBanner } from "./GoogleConnectBanner";

const none = { connected: false, eventsGrant: false, syncedAt: null, error: null };

describe("GoogleConnectBanner", () => {
  beforeEach(resetCalendarioUi);
  afterEach(cleanup);

  it("offers Conectar with the grant link and goes away on Ahora no", () => {
    render(<GoogleConnectBanner google={none} />);
    expect(screen.getByText("Conecta Google Calendar para ver tus reuniones.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Conectar" }).getAttribute("href")).toBe(
      "/api/auth/google/start?scope=calendar_events&return_to=%2Fcalendario",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByText("Conecta Google Calendar para ver tus reuniones.")).toBeNull();
  });

  it("is absent once connected with the grant", () => {
    render(<GoogleConnectBanner google={{ ...none, connected: true, eventsGrant: true }} />);
    expect(screen.queryByRole("link", { name: "Conectar" })).toBeNull();
  });

  it("shows the admin copy without Conectar on ACCESS_DENIED", () => {
    render(<GoogleConnectBanner google={{ ...none, error: "ACCESS_DENIED" }} />);
    expect(screen.getByText("Tu administrador todavía no habilita Google Calendar para Cincel.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Conectar" })).toBeNull();
  });
});
