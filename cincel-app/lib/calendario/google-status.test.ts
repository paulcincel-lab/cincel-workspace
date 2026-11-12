import { describe, expect, it } from "vitest";

import { bannerCopy, canAutoRefresh, googleStatusOf, shouldShowGoogleBanner, type GoogleInfo } from "./google-status";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const live: GoogleInfo = { connected: true, eventsGrant: true, syncedAt: "2026-11-11T11:55:00Z", error: null };

describe("googleStatusOf", () => {
  it("says how long ago it synced", () => {
    expect(googleStatusOf(live, NOW)).toEqual({ kind: "synced", text: "Google Calendar · sincronizado hace 5 min", action: null });
  });
  it("says No conectado without a grant and offers Conectar", () => {
    const s = googleStatusOf({ ...live, eventsGrant: false }, NOW);
    expect(s).toMatchObject({ text: "No conectado", action: "connect" });
  });
  it("asks to reconnect on REAUTH", () => {
    expect(googleStatusOf({ ...live, error: "REAUTH" }, NOW)).toMatchObject({ text: "Vuelve a conectar Google Calendar", action: "connect" });
  });
  it("shows the admin copy and no action on ACCESS_DENIED", () => {
    const s = googleStatusOf({ connected: false, eventsGrant: false, syncedAt: null, error: "ACCESS_DENIED" }, NOW);
    expect(s).toMatchObject({ text: "Tu administrador todavía no habilita Google Calendar para Cincel.", action: null });
  });
  it("offers Reintentar when the last refresh failed", () => {
    expect(googleStatusOf({ ...live, error: "UNAVAILABLE" }, NOW)).toMatchObject({
      text: "No se pudo actualizar Google Calendar.",
      action: "retry",
    });
  });
});

describe("banner", () => {
  const none: GoogleInfo = { connected: false, eventsGrant: false, syncedAt: null, error: null };
  it("shows once without a grant and hides when dismissed or granted", () => {
    expect(shouldShowGoogleBanner(none, false)).toBe(true);
    expect(shouldShowGoogleBanner(none, true)).toBe(false);
    expect(shouldShowGoogleBanner(live, false)).toBe(false);
  });
  it("has no Conectar when the admin has not allowed the scopes", () => {
    expect(bannerCopy({ ...none, error: "ACCESS_DENIED" })).toEqual({
      text: "Tu administrador todavía no habilita Google Calendar para Cincel.",
      canConnect: false,
    });
    expect(bannerCopy(none)).toEqual({ text: "Conecta Google Calendar para ver tus reuniones.", canConnect: true });
  });
});

describe("canAutoRefresh", () => {
  it("needs a live grant without admin or token problems", () => {
    expect(canAutoRefresh(live)).toBe(true);
    expect(canAutoRefresh({ ...live, eventsGrant: false })).toBe(false);
    expect(canAutoRefresh({ ...live, error: "REAUTH" })).toBe(false);
    expect(canAutoRefresh({ ...live, error: "ACCESS_DENIED" })).toBe(false);
  });
});
