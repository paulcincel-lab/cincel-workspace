// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildRawEmail, replyReferences } from "./compose";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("buildRawEmail", () => {
  it("builds a base64url RFC 5322 message with a UTF-8 text body", async () => {
    const raw = await buildRawEmail({ to: ["a@x.mx", "b@x.mx"], subject: "Cotización", body: "Hola **Luis**" });
    expect(raw).not.toMatch(/[+/=]/);
    const message = decode(raw);
    expect(message).toMatch(/^To: a@x\.mx, b@x\.mx$/m);
    expect(message).toMatch(/^Subject: =\?UTF-8\?/m);
    expect(message).toMatch(/^Content-Type: text\/plain; charset=utf-8$/m);
    const body = message.split(/\r\n\r\n/).slice(1).join("").replace(/\s+/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hola **Luis**");
  });

  it("threads replies with In-Reply-To and References", async () => {
    const message = decode(
      await buildRawEmail({ to: ["a@x.mx"], subject: "Re: x", body: "ok", inReplyTo: "<m2@x>", references: "<m1@x>" }),
    );
    expect(message).toMatch(/^In-Reply-To: <m2@x>$/m);
    expect(message).toMatch(/^References: <m1@x> <m2@x>$/m);
  });
});

describe("replyReferences", () => {
  it("appends the answered id once", () => {
    expect(replyReferences("<a> <b>", "<c>")).toEqual(["<a>", "<b>", "<c>"]);
    expect(replyReferences("<a> <c>", "<c>")).toEqual(["<a>", "<c>"]);
    expect(replyReferences(undefined, undefined)).toEqual([]);
  });
});
