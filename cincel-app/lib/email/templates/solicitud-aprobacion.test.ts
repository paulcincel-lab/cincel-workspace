import { describe, expect, it } from "vitest";

import { solicitudAprobacionEmail } from "./solicitud-aprobacion";

describe("solicitudAprobacionEmail", () => {
  const params = {
    staffName: "Ana",
    projectName: "Casa Ruiz",
    projectId: "p-1",
    fileName: "Plano A.pdf",
    message: "Revisa la cocina <b>hoy</b>",
    appOrigin: "https://app.cincel.example/",
  };

  it("links to the project in the portal, never to Drive", () => {
    const mail = solicitudAprobacionEmail(params);
    expect(mail.subject).toBe("Aprobación pendiente: Plano A.pdf · Casa Ruiz");
    expect(mail.text).toContain("https://app.cincel.example/portal/proyectos/p-1");
    expect(mail.html).toContain('href="https://app.cincel.example/portal/proyectos/p-1"');
    expect(mail.text).not.toContain("drive.google.com");
    expect(mail.html).not.toContain("drive.google.com");
  });

  it("escapes the staff message in the HTML", () => {
    const mail = solicitudAprobacionEmail(params);
    expect(mail.html).toContain("Revisa la cocina &lt;b&gt;hoy&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>hoy</b>");
    expect(mail.text).toContain("Revisa la cocina <b>hoy</b>");
  });

  it("omits the message paragraph when it is blank", () => {
    const mail = solicitudAprobacionEmail({ ...params, message: "   " });
    expect(mail.text.startsWith("Ana te pide revisar y aprobar Plano A.pdf del proyecto Casa Ruiz.\n\nAbre")).toBe(true);
  });
});
