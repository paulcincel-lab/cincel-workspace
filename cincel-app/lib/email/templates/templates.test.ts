import { describe, expect, it } from "vitest";

import { archivoRecibidoEmail, enlaceAccesoEmail, invitacionEmail } from "./index";

describe("invitacionEmail", () => {
  const mail = invitacionEmail({
    staffName: "Ana Pérez",
    projectName: "Casa Roble",
    appOrigin: "https://app.example.test/",
  });

  it("names the project and the staff member", () => {
    expect(mail.subject).toBe("Te invitaron a ver Casa Roble en Cincel");
    expect(mail.text).toContain("Ana Pérez te invitó a ver el proyecto Casa Roble en Cincel.");
    expect(mail.html).toContain("Ana Pérez te invitó a ver el proyecto Casa Roble en Cincel.");
  });

  it("links to /portal/login without the email in the query string", () => {
    expect(mail.text).toContain("https://app.example.test/portal/login\n");
    expect(mail.html).toContain('href="https://app.example.test/portal/login"');
    expect(mail.text).not.toContain("?email=");
    expect(mail.html).not.toContain("?email=");
  });

  it("escapes names in the HTML part", () => {
    const html = invitacionEmail({ staffName: "<b>x</b>", projectName: "A & B", appOrigin: "https://a.test" }).html;
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("enlaceAccesoEmail", () => {
  const url = "https://app.example.test/portal/acceder?token=abc123";
  const mail = enlaceAccesoEmail({ url });

  it("has the link as a button with the validity and ignore notes", () => {
    expect(mail.subject).toBe("Tu enlace de acceso a Cincel");
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.html).toContain("Entrar al portal");
    expect(mail.text).toContain(url);
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain("válido 15 minutos");
      expect(part).toContain("un solo uso");
      expect(part).toContain("Si no lo pediste, ignora este correo.");
    }
  });
});

describe("archivoRecibidoEmail", () => {
  const mail = archivoRecibidoEmail({
    clientName: "Luis Gómez",
    projectName: "Casa Roble",
    fileName: "planos.pdf",
    folderUrl: "https://drive.google.com/drive/folders/abc",
  });

  it("names the client, file, project and folder", () => {
    expect(mail.subject).toBe("Luis Gómez envió un archivo a Casa Roble");
    expect(mail.text).toBe(
      "Luis Gómez subió planos.pdf al proyecto Casa Roble. Está en 03 Del cliente: " +
        "https://drive.google.com/drive/folders/abc\n",
    );
    expect(mail.html).toContain('href="https://drive.google.com/drive/folders/abc"');
    expect(mail.html).toContain("planos.pdf");
  });
});
