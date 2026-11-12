import { describe, expect, it } from "vitest";

import { minutaEmail } from "./minuta";

const params = {
  title: "Junta con el cliente",
  when: "11 de noviembre de 2026, 10:00",
  decisions: ["Cocina en cuarzo blanco"],
  tasks: [
    { title: "Enviar planos", owner: "Ana García", date: "2026-11-13" },
    { title: "Mandar muestras", owner: null, date: null },
  ],
  nextMeeting: "25 de noviembre de 2026, 10:00",
  organizerName: "Luis Martínez",
};

describe("minutaEmail", () => {
  const mail = minutaEmail(params);

  it("names the meeting in the subject", () => {
    expect(mail.subject).toBe("Minuta · Junta con el cliente");
  });

  it("lists decisions, tasks with owner and date, and the next meeting", () => {
    expect(mail.text).toMatchInlineSnapshot(`
      "Luis Martínez comparte la minuta de la reunión "Junta con el cliente" (11 de noviembre de 2026, 10:00).

      Decisiones
      - Cocina en cuarzo blanco

      Tareas
      - Enviar planos · Ana García · 2026-11-13
      - Mandar muestras

      Próxima junta: 25 de noviembre de 2026, 10:00.
      "
    `);
    expect(mail.html).toContain("Cocina en cuarzo blanco");
    expect(mail.html).toContain("Enviar planos · Ana García · 2026-11-13");
  });

  it("omits empty sections and escapes the HTML", () => {
    const small = minutaEmail({ ...params, decisions: [], tasks: [{ title: "<b>x</b>", owner: null, date: null }], nextMeeting: null });
    expect(small.text).not.toContain("Decisiones");
    expect(small.text).not.toContain("Próxima junta");
    expect(small.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
