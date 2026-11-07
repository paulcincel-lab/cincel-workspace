import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMail } from "../index";
import {
  recordatorioEmail,
  resumenDiarioEmail,
  vacacionesDecisionEmail,
  vacacionesSolicitudEmail,
  type MailContent,
} from "../templates";

const DOC_OPEN =
  '<!doctype html><html lang="es"><body style="margin:0;padding:24px;font-family:Arial,sans-serif;' +
  'font-size:15px;line-height:1.5;color:#111;background:#fff">';
const DOC_CLOSE = "</body></html>";
const P = (text: string) => `<p style="margin:0 0 16px">${text}</p>`;
const BUTTON = (label: string, href: string) =>
  `<p style="margin:0 0 16px"><a href="${href}" style="display:inline-block;padding:10px 16px;background:#000;` +
  `color:#fff;text-decoration:none;border-radius:6px">${label}</a></p>`;
const H2 = (text: string) => `<h2 style="margin:24px 0 8px;font-size:16px;font-weight:600">${text}</h2>`;
const UL = (items: [string, string][]) =>
  `<ul style="margin:0 0 16px;padding-left:20px">` +
  items
    .map(([label, href]) => `<li style="margin:0 0 6px"><a href="${href}" style="color:#111">${label}</a></li>`)
    .join("") +
  "</ul>";
const doc = (...blocks: string[]) => `${DOC_OPEN}${blocks.join("")}${DOC_CLOSE}`;

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Sends through `sendMail` without SMTP_HOST (log mode) and returns what was logged. */
async function renderInLogMode(to: string, mail: MailContent): Promise<string> {
  const result = await sendMail({ to, ...mail }, {});
  expect(result).toEqual({ sent: false, reason: "not_configured" });
  return info.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
}

describe("recordatorioEmail", () => {
  const mail = recordatorioEmail({
    text: "Llamar a Luis por los planos",
    // 21:30 UTC is 15:30 in America/Mexico_City (UTC-6, no DST).
    dueAt: "2026-11-07T21:30:00.000Z",
    url: "https://app.example.test/mi-espacio",
  });

  it("matches the snapshot", () => {
    expect(mail).toEqual({
      subject: "Recordatorio: Llamar a Luis por los planos",
      text:
        "Llamar a Luis por los planos\n\n" +
        "Para el 7 de noviembre de 2026, 15:30.\n\n" +
        "Abrir en Cincel: https://app.example.test/mi-espacio\n",
      html: doc(
        P("Llamar a Luis por los planos"),
        P("Para el 7 de noviembre de 2026, 15:30."),
        BUTTON("Abrir en Cincel", "https://app.example.test/mi-espacio"),
      ),
    });
  });

  it("keeps the subject on one line and escapes the HTML part", () => {
    const tricky = recordatorioEmail({
      text: "Revisar <b>A & B</b>\nhoy",
      dueAt: "2026-01-02T06:05:00Z",
      url: "https://a.test/?x=1&y=2",
    });
    expect(tricky.subject).toBe("Recordatorio: Revisar <b>A & B</b> hoy");
    expect(tricky.text).toContain("Para el 2 de enero de 2026, 00:05.");
    expect(tricky.html).toContain("Revisar &lt;b&gt;A &amp; B&lt;/b&gt;");
    expect(tricky.html).toContain('href="https://a.test/?x=1&amp;y=2"');
    expect(tricky.html).not.toContain("<b>");
  });

  it("renders in SMTP log mode", async () => {
    const log = await renderInLogMode("ana@cincel.example", mail);
    expect(log).toContain("Subject: Recordatorio: Llamar a Luis por los planos");
    expect(log).toContain("Para el 7 de noviembre de 2026, 15:30.");
  });
});

describe("resumenDiarioEmail", () => {
  const mail = resumenDiarioEmail({
    asignaciones: [{ title: "Diseño de cocina", url: "https://app.example.test/actividades/1" }],
    menciones: [],
    vencimientos: [
      { title: "Entrega de planos", url: "https://app.example.test/actividades/2" },
      { title: "Cotización final", url: "https://app.example.test/actividades/3" },
    ],
    comentarios: [{ title: "Casa Roble", url: "https://app.example.test/proyectos/9" }],
  });

  it("matches the snapshot and omits empty sections", () => {
    expect(mail).toEqual({
      subject: "Tu resumen de hoy en Cincel",
      text:
        "Esto es lo que pasó hoy en Cincel.\n\n" +
        "Asignaciones\n- Diseño de cocina: https://app.example.test/actividades/1\n\n" +
        "Vencimientos\n- Entrega de planos: https://app.example.test/actividades/2\n" +
        "- Cotización final: https://app.example.test/actividades/3\n\n" +
        "Comentarios\n- Casa Roble: https://app.example.test/proyectos/9\n",
      html: doc(
        P("Esto es lo que pasó hoy en Cincel."),
        H2("Asignaciones"),
        UL([["Diseño de cocina", "https://app.example.test/actividades/1"]]),
        H2("Vencimientos"),
        UL([
          ["Entrega de planos", "https://app.example.test/actividades/2"],
          ["Cotización final", "https://app.example.test/actividades/3"],
        ]),
        H2("Comentarios"),
        UL([["Casa Roble", "https://app.example.test/proyectos/9"]]),
      ),
    });
    expect(mail.text).not.toContain("Menciones");
    expect(mail.html).not.toContain("Menciones");
  });

  it("says there is nothing new when every section is empty", () => {
    expect(resumenDiarioEmail({ asignaciones: [], menciones: [], vencimientos: [], comentarios: [] })).toEqual({
      subject: "Tu resumen de hoy en Cincel",
      text: "No hay novedades hoy.\n",
      html: doc(P("No hay novedades hoy.")),
    });
  });

  it("escapes titles and links", () => {
    const html = resumenDiarioEmail({
      asignaciones: [],
      menciones: [{ title: "<i>x</i>", url: "https://a.test/?a=1&b=2" }],
      vencimientos: [],
      comentarios: [],
    }).html;
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
    expect(html).toContain('href="https://a.test/?a=1&amp;b=2"');
  });

  it("renders in SMTP log mode", async () => {
    const log = await renderInLogMode("ana@cincel.example", mail);
    expect(log).toContain("Subject: Tu resumen de hoy en Cincel");
    expect(log).toContain("- Entrega de planos: https://app.example.test/actividades/2");
  });
});

describe("vacacionesDecisionEmail", () => {
  const approved = vacacionesDecisionEmail({
    decision: "aprobada",
    from: "2026-12-21",
    to: "2026-12-25",
    days: 5,
    approverName: "Paula Reyes",
    note: "Disfruta tus vacaciones",
  });

  it("matches the snapshot when approved", () => {
    expect(approved).toEqual({
      subject: "Tu solicitud de vacaciones fue aprobada",
      text:
        "Paula Reyes aprobó tu solicitud de vacaciones.\n\n" +
        "Fechas: del 21 de diciembre de 2026 al 25 de diciembre de 2026 (5 días).\n\n" +
        "Nota: Disfruta tus vacaciones\n",
      html: doc(
        P("Paula Reyes aprobó tu solicitud de vacaciones."),
        P("Fechas: del 21 de diciembre de 2026 al 25 de diciembre de 2026 (5 días)."),
        P("Nota: Disfruta tus vacaciones"),
      ),
    });
  });

  it("matches the snapshot when rejected, for one day and without a note", () => {
    expect(
      vacacionesDecisionEmail({
        decision: "rechazada",
        from: "2027-01-04",
        to: "2027-01-04",
        days: 1,
        approverName: "Paula Reyes",
        note: null,
      }),
    ).toEqual({
      subject: "Tu solicitud de vacaciones fue rechazada",
      text: "Paula Reyes rechazó tu solicitud de vacaciones.\n\nFechas: el 4 de enero de 2027 (1 día).\n",
      html: doc(P("Paula Reyes rechazó tu solicitud de vacaciones."), P("Fechas: el 4 de enero de 2027 (1 día).")),
    });
  });

  it("renders in SMTP log mode", async () => {
    const log = await renderInLogMode("luis@cincel.example", approved);
    expect(log).toContain("Subject: Tu solicitud de vacaciones fue aprobada");
    expect(log).toContain("Nota: Disfruta tus vacaciones");
  });
});

describe("vacacionesSolicitudEmail", () => {
  const mail = vacacionesSolicitudEmail({
    requesterName: "Luis Gómez",
    from: "2026-12-21",
    to: "2026-12-25",
    days: 5,
    url: "https://app.example.test/biblioteca/solicitudes",
  });

  it("matches the snapshot", () => {
    expect(mail).toEqual({
      subject: "Nueva solicitud de ausencia de Luis Gómez",
      text:
        "Luis Gómez pidió una ausencia del 21 de diciembre de 2026 al 25 de diciembre de 2026 (5 días).\n\n" +
        "Revisar solicitudes: https://app.example.test/biblioteca/solicitudes\n",
      html: doc(
        P("Luis Gómez pidió una ausencia del 21 de diciembre de 2026 al 25 de diciembre de 2026 (5 días)."),
        BUTTON("Revisar solicitudes", "https://app.example.test/biblioteca/solicitudes"),
      ),
    });
  });

  it("never names the kind of absence", () => {
    for (const part of [mail.subject, mail.text, mail.html]) {
      expect(part).not.toMatch(/vacaciones|personal|enfermedad/i);
    }
  });

  it("renders in SMTP log mode", async () => {
    const log = await renderInLogMode(["paula@cincel.example", "dir@cincel.example"].join(", "), mail);
    expect(log).toContain("To: paula@cincel.example, dir@cincel.example");
    expect(log).toContain("Subject: Nueva solicitud de ausencia de Luis Gómez");
  });
});
