/**
 * `parseReminderText` (redesign BE §8.4, §16): every example and rule row of
 * the table, "a las 3" before and after 15:00, "31 de febrero" → null,
 * accents and case. America/Mexico_City is UTC−6 all year, so local 09:00 is
 * 15:00Z.
 */
import { describe, expect, it } from "vitest";

import { parseReminderText, parseTimeFragment } from "./reminder-parser";

/** Fri 2026-11-06 14:14 in America/Mexico_City. */
const NOW = new Date("2026-11-06T20:14:00.000Z");

function parse(text: string, now = NOW) {
  return parseReminderText(text, now);
}

describe("parseReminderText: BE §8.4 examples (now = Fri 2026-11-06 14:14)", () => {
  it.each([
    ["recuérdame mañana 9am llamar a Juanma", "llamar a Juanma", "2026-11-07T15:00:00.000Z", "none"],
    ["enviar factura en 2 horas", "enviar factura", "2026-11-06T22:14:00.000Z", "none"],
    ["visita de obra el lunes a las 10", "visita de obra", "2026-11-09T16:00:00.000Z", "none"],
    ["revisar bitácora cada viernes 5pm", "revisar bitácora", "2026-11-13T23:00:00.000Z", "weekly"],
    ["pagar IMSS el 15", "pagar IMSS", "2026-11-15T15:00:00.000Z", "none"],
    ["comprar material", "comprar material", null, "none"],
  ])("%s", (input, cleanText, dueAt, repeat) => {
    expect(parse(input)).toEqual({ cleanText, dueAt, repeat });
  });
});

describe("parseReminderText: rule rows", () => {
  it.each([
    // Relative minutes/hours
    ["llamar en 15 min", "llamar", "2026-11-06T20:29:00.000Z"],
    ["llamar en 2 horas", "llamar", "2026-11-06T22:14:00.000Z"],
    ["llamar en media hora", "llamar", "2026-11-06T20:44:00.000Z"],
    ["llamar en una hora", "llamar", "2026-11-06T21:14:00.000Z"],
    // Today / tonight
    ["junta hoy a las 5", "junta", "2026-11-06T23:00:00.000Z"],
    ["junta hoy 17:30", "junta", "2026-11-06T23:30:00.000Z"],
    ["junta esta tarde", "junta", "2026-11-06T22:00:00.000Z"],
    ["junta esta noche", "junta", "2026-11-07T02:00:00.000Z"],
    ["junta esta noche a las 9", "junta", "2026-11-07T03:00:00.000Z"],
    // Tomorrow / day after (default 09:00)
    ["junta mañana", "junta", "2026-11-07T15:00:00.000Z"],
    ["junta mañana 9am", "junta", "2026-11-07T15:00:00.000Z"],
    ["junta pasado mañana a las 10", "junta", "2026-11-08T16:00:00.000Z"],
    ["junta mañana a las 3", "junta", "2026-11-07T21:00:00.000Z"],
    // Weekday: next occurrence, today excluded, default 09:00
    ["junta el lunes", "junta", "2026-11-09T15:00:00.000Z"],
    ["junta viernes 4pm", "junta", "2026-11-13T22:00:00.000Z"],
    ["junta el próximo martes", "junta", "2026-11-10T15:00:00.000Z"],
    ["junta el sábado", "junta", "2026-11-07T15:00:00.000Z"],
    // Date: that date (next year if past), default 09:00
    ["pago el 15", "pago", "2026-11-15T15:00:00.000Z"],
    ["pago 15 de diciembre", "pago", "2026-12-15T15:00:00.000Z"],
    ["pago 15/12", "pago", "2026-12-15T15:00:00.000Z"],
    ["pago 15/12/2026 10:00", "pago", "2026-12-15T16:00:00.000Z"],
    ["pago el 15 de octubre", "pago", "2027-10-15T15:00:00.000Z"],
    ["pago el 3", "pago", "2026-12-03T15:00:00.000Z"],
    ["pago el 6", "pago", "2026-12-06T15:00:00.000Z"],
    ["pago el 15 a las 10", "pago", "2026-11-15T16:00:00.000Z"],
    // Time only: today if future, else tomorrow; "a las 1–7" without am/pm → pm
    ["llamar a las 3", "llamar", "2026-11-06T21:00:00.000Z"],
    ["llamar 3pm", "llamar", "2026-11-06T21:00:00.000Z"],
    ["llamar 15:00", "llamar", "2026-11-06T21:00:00.000Z"],
    ["llamar 9 de la mañana", "llamar", "2026-11-07T15:00:00.000Z"],
    ["llamar 3 de la tarde", "llamar", "2026-11-06T21:00:00.000Z"],
    ["llamar a las 7", "llamar", "2026-11-07T01:00:00.000Z"],
    ["llamar a las 8", "llamar", "2026-11-07T14:00:00.000Z"],
    ["llamar a la 1", "llamar", "2026-11-07T19:00:00.000Z"],
  ])("%s", (input, cleanText, dueAt) => {
    expect(parse(input)).toEqual({ cleanText, dueAt, repeat: "none" });
  });
});

describe("parseReminderText: repeat", () => {
  it.each([
    ["tomar agua cada día", "tomar agua", null, "daily"],
    ["tomar agua diario", "tomar agua", null, "daily"],
    ["tomar agua todos los días a las 8", "tomar agua", "2026-11-07T14:00:00.000Z", "daily"],
    ["respaldo cada semana", "respaldo", null, "weekly"],
    ["junta cada lunes", "junta", "2026-11-09T15:00:00.000Z", "weekly"],
    ["revisar bitácora cada viernes 5pm", "revisar bitácora", "2026-11-13T23:00:00.000Z", "weekly"],
    ["corte cada mes", "corte", null, "monthly"],
    ["pagar renta cada 1°", "pagar renta", "2026-12-01T15:00:00.000Z", "monthly"],
    ["pagar renta el 15 de cada mes", "pagar renta", "2026-11-15T15:00:00.000Z", "monthly"],
  ])("%s", (input, cleanText, dueAt, repeat) => {
    expect(parse(input)).toEqual({ cleanText, dueAt, repeat });
  });

  it("does not read a time unit after `cada` as a day of the month", () => {
    expect(parse("revisar cada 2 horas")).toEqual({ cleanText: "revisar cada 2 horas", dueAt: null, repeat: "none" });
  });
});

describe("parseReminderText: edge cases", () => {
  it("'a las 3' is today before 15:00 and tomorrow after", () => {
    expect(parse("a las 3").dueAt).toBe("2026-11-06T21:00:00.000Z");
    expect(parse("a las 3", new Date("2026-11-06T21:30:00.000Z")).dueAt).toBe("2026-11-07T21:00:00.000Z");
  });

  it("'31 de febrero' names no date: dueAt null and the text is kept", () => {
    expect(parse("pagar 31 de febrero")).toEqual({ cleanText: "pagar 31 de febrero", dueAt: null, repeat: "none" });
    expect(parse("pagar 31/02/2027").dueAt).toBeNull();
    expect(parse("pagar 31/02").dueAt).toBeNull();
  });

  it("'29 de febrero' moves to the next leap year", () => {
    expect(parse("pagar 29 de febrero").dueAt).toBe("2028-02-29T15:00:00.000Z");
  });

  it("is accent- and case-insensitive and keeps the original spelling in cleanText", () => {
    const expected = { cleanText: "llamar a Juanma", dueAt: "2026-11-07T15:00:00.000Z", repeat: "none" };
    expect(parse("RECUÉRDAME MAÑANA 9AM llamar a Juanma")).toEqual(expected);
    expect(parse("recuerdame manana 9am llamar a Juanma")).toEqual(expected);
    expect(parse("Recuérdame mañana 9 a.m. llamar a Juanma")).toEqual(expected);
    expect(parse("revisar bitácora el MIÉRCOLES").dueAt).toBe("2026-11-11T15:00:00.000Z");
    expect(parse("revisar bitácora el miercoles").dueAt).toBe("2026-11-11T15:00:00.000Z");
  });

  it("strips a leading 'recordarme' / 'recordar' only", () => {
    expect(parse("recordarme pagar luz mañana").cleanText).toBe("pagar luz");
    expect(parse("recordar pagar luz mañana").cleanText).toBe("pagar luz");
    expect(parse("pagar luz, recuérdame").cleanText).toBe("pagar luz, recuérdame");
  });

  it("first match wins: the earlier rule decides and the later fragment stays", () => {
    expect(parse("llamar mañana el lunes")).toEqual({
      cleanText: "llamar el lunes",
      dueAt: "2026-11-07T15:00:00.000Z",
      repeat: "none",
    });
  });

  it("'mañana' inside 'de la mañana' / 'esta mañana' or a word ending in 'en' is handled", () => {
    expect(parse("vienen mañana").cleanText).toBe("vienen");
    expect(parse("vienen mañana").dueAt).toBe("2026-11-07T15:00:00.000Z");
    expect(parse("junta esta mañana").dueAt).toBeNull();
  });

  it("an out-of-range time names no date", () => {
    expect(parse("llamar a las 25").dueAt).toBeNull();
    expect(parse("llamar mañana a las 9:75").dueAt).toBeNull();
  });

  it("returns an empty cleanText when the text is only a date", () => {
    expect(parse("mañana 9am")).toEqual({ cleanText: "", dueAt: "2026-11-07T15:00:00.000Z", repeat: "none" });
  });

  it("uses the given time zone", () => {
    expect(parseReminderText("mañana 9am", NOW, "UTC").dueAt).toBe("2026-11-07T09:00:00.000Z");
  });
});

describe("parseTimeFragment", () => {
  it.each([
    ["a las 3", { hour: 15, minute: 0 }],
    ["a las 03:00", { hour: 3, minute: 0 }],
    ["a las 10", { hour: 10, minute: 0 }],
    ["a las 12", { hour: 12, minute: 0 }],
    ["12am", { hour: 0, minute: 0 }],
    ["12pm", { hour: 12, minute: 0 }],
    ["9:30pm", { hour: 21, minute: 30 }],
    ["17:30", { hour: 17, minute: 30 }],
    ["8 de la noche", { hour: 20, minute: 0 }],
    ["13pm", null],
    ["24:00", null],
  ])("%s", (fragment, expected) => {
    expect(parseTimeFragment(fragment)).toEqual(expected);
  });
});
