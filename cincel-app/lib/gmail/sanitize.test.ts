// @vitest-environment node
/** Email HTML allowlist (redesign BE §8.6). */
import { describe, expect, it } from "vitest";

import { REMOTE_IMAGE_LINK_TEXT, sanitizeEmailHtml } from "./sanitize";

describe("sanitizeEmailHtml", () => {
  it.each([
    ["script tags with their content", "<p>Hola<script>alert(1)</script></p>", "<p>Hola</p>"],
    ["style blocks with their content", "<style>body{display:none}</style><p>x</p>", "<p>x</p>"],
    ["event handlers", '<p onclick="steal()" onmouseover="x">x</p>', "<p>x</p>"],
    ["iframes, objects and forms", '<iframe src="https://x.test"></iframe><object></object><form><input name="p"></form>t', "t"],
    ["svg payloads", "<svg><script>1</script><circle/></svg>ok", "ok"],
    ["id and class hooks", '<b id="a" class="b">b</b>', "<b>b</b>"],
  ])("drops %s", (_label, input, expected) => {
    expect(sanitizeEmailHtml(input)).toBe(expected);
  });

  it.each([
    ["javascript:", '<a href="javascript:alert(1)">x</a>'],
    ["JavaScript: with odd casing", '<a href="JaVaScRiPt:alert(1)">x</a>'],
    ["vbscript:", '<a href="vbscript:msgbox(1)">x</a>'],
    ["data: on links", '<a href="data:text/html,<script>1</script>">x</a>'],
    ["protocol-relative", '<a href="//evil.test">x</a>'],
  ])("strips %s URLs", (_label, input) => {
    expect(sanitizeEmailHtml(input)).not.toMatch(/href=/);
  });

  it("keeps http(s), mailto and tel links and opens them in a new tab", () => {
    const out = sanitizeEmailHtml(
      '<a href="https://cincel.example/a">a</a><a href="mailto:ana@cincel.example">m</a><a href="tel:+525555555555">t</a>',
    );
    expect(out).toContain('href="https://cincel.example/a"');
    expect(out).toContain('href="mailto:ana@cincel.example"');
    expect(out).toContain('href="tel:+525555555555"');
    expect(out.match(/target="_blank"/g)).toHaveLength(3);
    expect(out.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
  });

  it("turns a remote image into a link (nothing loads on open)", () => {
    const out = sanitizeEmailHtml('<img src="https://tracker.test/p.gif" alt="Logo"><img src="http://x.test/a.png">');
    expect(out).not.toContain("<img");
    expect(out).toContain('<a href="https://tracker.test/p.gif" target="_blank" rel="noopener noreferrer">Logo</a>');
    expect(out).toContain(`<a href="http://x.test/a.png" target="_blank" rel="noopener noreferrer">${REMOTE_IMAGE_LINK_TEXT}</a>`);
  });

  it("keeps inline raster data images and drops cid: / svg sources", () => {
    expect(sanitizeEmailHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="i">')).toBe(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="i" />',
    );
    expect(sanitizeEmailHtml('<img src="cid:logo@x" alt="Logo">')).toBe("<span>Logo</span>");
    expect(sanitizeEmailHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="s">')).toBe("<span>s</span>");
  });

  it("keeps plain style declarations and drops style abuse", () => {
    const out = sanitizeEmailHtml(
      '<div style="color:#333;position:fixed;z-index:9999;top:0;background-image:url(https://x.test/t);width:expression(alert(1));padding:4px 8px">a</div>',
    );
    expect(out).toBe('<div style="color:#333;padding:4px 8px">a</div>');
  });

  it("keeps email layout tables", () => {
    const html =
      '<table cellpadding="4" width="600"><tr><td colspan="2" align="center" style="border:1px solid #ccc">c</td></tr></table>';
    expect(sanitizeEmailHtml(html)).toBe(
      '<table cellpadding="4" width="600"><tr><td colspan="2" align="center" style="border:1px solid #ccc">c</td></tr></table>',
    );
  });

  it("keeps text formatting", () => {
    const html = "<p><b>b</b> <i>i</i> <u>u</u></p><ul><li>uno</li></ul><blockquote>q</blockquote><br />";
    expect(sanitizeEmailHtml(html)).toBe(html);
  });
});
