// @vitest-environment node
import { describe, expect, it } from "vitest";

import { sanitizeMondayHtml } from "@/scripts/monday/sanitize";

describe("sanitizeMondayHtml", () => {
  it("returns an empty string for empty input", () => {
    expect(sanitizeMondayHtml("")).toBe("");
    expect(sanitizeMondayHtml("   \n ")).toBe("");
    expect(sanitizeMondayHtml(null)).toBe("");
    expect(sanitizeMondayHtml(undefined)).toBe("");
    expect(sanitizeMondayHtml("<p></p><br>")).toBe("");
  });

  it("drops scripts, styles and their content", () => {
    expect(
      sanitizeMondayHtml(
        '<p>Hola</p><script>alert("x")</script><style>p{color:red}</style>',
      ),
    ).toBe("Hola");
  });

  it("removes disallowed tags but keeps their text", () => {
    expect(
      sanitizeMondayHtml(
        '<p><span style="color:red">Revisar</span> <u>planos</u> <img src="x" onerror="alert(1)"></p>',
      ),
    ).toBe("Revisar planos");
  });

  it("drops event handlers and javascript links", () => {
    expect(
      sanitizeMondayHtml(
        '<p onclick="alert(1)">Ver <a href="javascript:alert(1)">aquí</a></p>',
      ),
    ).toBe("Ver aquí");
  });

  it("keeps the text of bold and italic", () => {
    expect(sanitizeMondayHtml("<p><b>Urgente</b>: <i>hoy</i></p>")).toBe(
      "Urgente: hoy",
    );
  });

  it("separates paragraphs with a blank line and keeps line breaks", () => {
    expect(sanitizeMondayHtml("<p>Uno<br>dos</p><p>Tres</p>")).toBe(
      "Uno\ndos\n\nTres",
    );
  });

  it("collapses HTML whitespace", () => {
    expect(sanitizeMondayHtml("<p>  Uno \n\t dos  </p>")).toBe("Uno dos");
  });

  it("turns unordered and ordered lists into lines", () => {
    expect(
      sanitizeMondayHtml(
        "<p>Pendientes:</p><ul><li>Cotizar</li><li>Firmar</li></ul><ol><li>Primero</li><li>Segundo</li></ol><p>Fin</p>",
      ),
    ).toBe(
      "Pendientes:\n\n- Cotizar\n- Firmar\n\n1. Primero\n2. Segundo\n\nFin",
    );
  });

  it("indents nested lists", () => {
    expect(
      sanitizeMondayHtml("<ul><li>A<ul><li>A1</li></ul></li><li>B</li></ul>"),
    ).toBe("- A\n  - A1\n- B");
  });

  it('keeps links as "text (url)"', () => {
    expect(
      sanitizeMondayHtml(
        '<p>Ver <a href="https://example.com/plano?a=1&amp;b=2">el plano</a> hoy</p>',
      ),
    ).toBe("Ver el plano (https://example.com/plano?a=1&b=2) hoy");
  });

  it("does not repeat the url when the link text is the url", () => {
    expect(
      sanitizeMondayHtml(
        '<a href="https://example.com">https://example.com</a> y <a href="mailto:a@b.mx">a@b.mx</a>',
      ),
    ).toBe("https://example.com y a@b.mx");
  });

  it("uses the url when the link has no text", () => {
    expect(sanitizeMondayHtml('<a href="https://example.com"></a>')).toBe(
      "https://example.com",
    );
  });

  it("decodes entities to plain text", () => {
    expect(
      sanitizeMondayHtml("<p>5 &lt; 6 &amp; &quot;ok&quot;&nbsp;ya</p>"),
    ).toBe('5 < 6 & "ok" ya');
  });

  it("keeps plain text without markup", () => {
    expect(sanitizeMondayHtml("Solo texto")).toBe("Solo texto");
  });
});
