// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ sendMail: vi.fn() }));

const { pickUploadRecipients } = await import("@/lib/portal/upload-service");

describe("pickUploadRecipients", () => {
  it("uses the manager and coordinator emails, lowercased and without duplicates", async () => {
    const everyone = vi.fn(async () => [{ email: "admin@cincel.example", role: "Administrador" }]);
    await expect(
      pickUploadRecipients([{ email: "Gerente@Cincel.example" }, { email: "gerente@cincel.example " }], everyone)
    ).resolves.toEqual(["gerente@cincel.example"]);
    expect(everyone).not.toHaveBeenCalled();
  });

  it("sends to both when manager and coordinator differ", async () => {
    await expect(
      pickUploadRecipients([{ email: "gerente@cincel.example" }, { email: "coord@cincel.example" }], async () => [])
    ).resolves.toEqual(["gerente@cincel.example", "coord@cincel.example"]);
  });

  it("falls back to every Administrador when neither has an email", async () => {
    const everyone = async () => [
      { email: "admin1@cincel.example", role: "Administrador" },
      { email: "dir@cincel.example", role: "Dirección" },
      { email: "admin2@cincel.example", role: " administrador " },
      { email: null, role: "Administrador" },
    ];
    await expect(pickUploadRecipients([{ email: null }, { email: "  " }], everyone)).resolves.toEqual([
      "admin1@cincel.example",
      "admin2@cincel.example",
    ]);
  });

  it("returns nobody when there are no administrators either", async () => {
    await expect(pickUploadRecipients([], async () => [{ email: "x@cincel.example", role: "Usuario" }])).resolves.toEqual(
      []
    );
  });
});
