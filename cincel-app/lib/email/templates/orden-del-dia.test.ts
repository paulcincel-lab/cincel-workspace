import { describe, expect, it } from "vitest";

import { ordenDelDiaEmail } from "./orden-del-dia";

const base = {
  title: "Revisión con cliente",
  when: "miércoles 11 nov, 10:00 – 11:00",
  location: "Sala 2",
  meetUrl: "https://meet.example.test/abc-defg-hij",
  items: ["Avance y nueva fecha de Ingenierías", "Decisión de acabado de cocina (pendiente del 28 oct)"],
  organizerName: "Ana García",
};

describe("ordenDelDiaEmail", () => {
  it("builds the subject and the numbered text", () => {
    const mail = ordenDelDiaEmail(base);
    expect(mail.subject).toBe("Orden del día · Revisión con cliente");
    expect(mail.text).toMatchInlineSnapshot(`
      "Ana García envió el orden del día de la reunión.

      Revisión con cliente
      miércoles 11 nov, 10:00 – 11:00
      Lugar: Sala 2
      Meet: https://meet.example.test/abc-defg-hij

      Orden del día
      1. Avance y nueva fecha de Ingenierías
      2. Decisión de acabado de cocina (pendiente del 28 oct)
      "
    `);
  });

  it("omits place and Meet when there are none", () => {
    const mail = ordenDelDiaEmail({ ...base, location: null, meetUrl: null });
    expect(mail.text).not.toContain("Lugar:");
    expect(mail.text).not.toContain("Meet:");
    expect(mail.html).not.toContain("Lugar:");
  });

  it("escapes titles and items in the HTML part", () => {
    const mail = ordenDelDiaEmail({ ...base, title: "<b>x</b>", items: ["A & B"] });
    expect(mail.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(mail.html).toContain("A &amp; B");
    expect(mail.html).not.toContain("<b>x</b>");
  });
});
