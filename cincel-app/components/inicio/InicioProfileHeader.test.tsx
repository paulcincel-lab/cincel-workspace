// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { buildDefaultGeneralSettings } from "@/lib/settings/general-settings";
import type { MyProfile } from "@/lib/types/shell";

import { InicioProfileHeader } from "./InicioProfileHeader";

afterEach(cleanup);

function setup(company: { instagramUrl?: string; website: string }, profile: MyProfile) {
  const client = createTestQueryClient();
  const settings = buildDefaultGeneralSettings();
  settings.company = { ...settings.company, ...company };
  client.setQueryData(qk.org.general(), { settings } as never);
  client.setQueryData(qk.me.profile(), profile);
  return renderWithQueryClient(
    <InicioProfileHeader title="Buenos días, Ana" description="Hoy" fallbackName="Ana" actions={<button type="button">Nueva tarea</button>} />,
    { client },
  );
}

describe("InicioProfileHeader", () => {
  it("shows the photo button, the title and both company links", () => {
    setup(
      { instagramUrl: "https://www.instagram.com/cincel.mx/", website: "https://www.cincel.mx/" },
      { id: "s1", name: "Ana López", photoUrl: null } as MyProfile,
    );
    expect(screen.getByRole("heading", { name: "Buenos días, Ana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subir foto de perfil" })).toBeTruthy();
    expect(screen.getByText("AL")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir Instagram" }).getAttribute("href")).toBe("https://www.instagram.com/cincel.mx/");
    expect(screen.getByRole("link", { name: "Abrir Sitio web" }).getAttribute("href")).toBe("https://www.cincel.mx/");
  });

  it("hides the empty links and offers to change an existing photo", () => {
    setup({ instagramUrl: "", website: "" }, { id: "s1", name: "Ana López", photoUrl: "/foto.jpg" } as MyProfile);
    expect(screen.queryByRole("link", { name: /Abrir/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Cambiar foto de perfil" })).toBeTruthy();
  });
});
