// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  attachmentContentDisposition,
  attachmentMime,
  attachmentName,
  decodeBody,
  findPart,
  findRawMessage,
  formatAddress,
  parseAddress,
  parseAttachmentRef,
  parseGmailThread,
  splitAddressList,
} from "./thread-view";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

const thread = {
  id: "t1",
  messages: [
    {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Hola",
      internalDate: String(Date.UTC(2026, 10, 1, 9, 30)),
      payload: {
        partId: "",
        mimeType: "multipart/mixed",
        headers: [
          { name: "Subject", value: "Medidas" },
          { name: "From", value: '"Pérez, Luis" <luis@cliente.mx>' },
          { name: "To", value: '"Ana, Obra" <ana@cincel.mx>, bob@cincel.mx' },
          { name: "Cc", value: "" },
          { name: "Message-Id", value: "<m1@cliente.mx>" },
          { name: "References", value: "<m0@cliente.mx>" },
        ],
        parts: [
          {
            partId: "0",
            mimeType: "multipart/alternative",
            parts: [
              { partId: "0.0", mimeType: "text/plain", body: { data: b64("Hola texto") } },
              { partId: "0.1", mimeType: "text/html", body: { data: b64("<p>Hola</p>") } },
            ],
          },
          { partId: "1", mimeType: "image/png", filename: "foto.png", body: { attachmentId: "x", size: 10 } },
          {
            partId: "2",
            mimeType: "Text/HTML; bad",
            filename: "",
            headers: [{ name: "Content-Disposition", value: "attachment" }],
            body: { attachmentId: "y", size: 5 },
          },
        ],
      },
    },
  ],
};

describe("parseGmailThread", () => {
  it("reads headers, bodies and attachments", () => {
    const parsed = parseGmailThread(thread);
    expect(parsed.id).toBe("t1");
    const [m] = parsed.messages;
    expect(m).toMatchObject({
      id: "m1",
      subject: "Medidas",
      from: "Pérez, Luis <luis@cliente.mx>",
      to: ["Ana, Obra <ana@cincel.mx>", "bob@cincel.mx"],
      cc: [],
      date: new Date(Date.UTC(2026, 10, 1, 9, 30)).toISOString(),
      messageIdHeader: "<m1@cliente.mx>",
      references: "<m0@cliente.mx>",
      labelIds: ["INBOX", "UNREAD"],
      html: "<p>Hola</p>",
      text: "Hola texto",
    });
    expect(m!.attachments).toEqual([
      { messageId: "m1", attachmentId: "t1~1", name: "foto.png", mime: "image/png", size: 10 },
      { messageId: "m1", attachmentId: "t1~2", name: "adjunto", mime: "application/octet-stream", size: 5 },
    ]);
  });

  it("NOT_FOUND for anything that isn't a thread with messages", () => {
    for (const raw of [null, "x", {}, { id: "t1" }, { id: "t1", messages: [] }]) {
      expect(() => parseGmailThread(raw)).toThrow(/^NOT_FOUND$/);
    }
  });
});

describe("addresses", () => {
  it("splits on commas outside quotes and angle brackets", () => {
    expect(splitAddressList('"A, B" <a@x.mx>, c@x.mx,  <d@x.mx>')).toEqual(['"A, B" <a@x.mx>', "c@x.mx", "<d@x.mx>"]);
    expect(splitAddressList("")).toEqual([]);
  });

  it("parses and formats", () => {
    expect(parseAddress('"Luis \\"L\\"" <l@x.mx>')).toEqual({ name: 'Luis "L"', email: "l@x.mx" });
    expect(parseAddress("l@x.mx")).toEqual({ name: "", email: "l@x.mx" });
    expect(formatAddress({ name: "Luis", email: "l@x.mx" })).toBe("Luis <l@x.mx>");
    expect(formatAddress({ name: "", email: "l@x.mx" })).toBe("l@x.mx");
  });
});

describe("bodies", () => {
  it("decodes the declared charset", () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]).toString("base64url");
    expect(decodeBody(latin1, "iso-8859-1")).toBe("café");
    expect(decodeBody(b64("café"), "no-such-charset")).toBe("café");
  });
});

describe("attachment refs", () => {
  it("round-trips threadId~partId and rejects anything else", () => {
    expect(parseAttachmentRef("t1~0.1")).toEqual({ threadId: "t1", partId: "0.1" });
    for (const bad of ["", "t1", "~1", "t1~", "../t1~1", "t1~1/2", "t1~a"]) {
      expect(parseAttachmentRef(bad)).toBeNull();
    }
  });

  it("finds parts and messages", () => {
    expect(findPart(thread.messages[0]!.payload, "0.1")).toMatchObject({ mimeType: "text/html" });
    expect(findPart(thread.messages[0]!.payload, "9")).toBeNull();
    expect(findRawMessage(thread, "m1")).toBe(thread.messages[0]);
    expect(findRawMessage(thread, "m2")).toBeNull();
  });

  it("cleans names and mime types; encodes Content-Disposition per RFC 5987", () => {
    expect(attachmentName({ filename: "a/b\r\n.pdf" })).toBe("a_b.pdf");
    expect(attachmentName({ filename: "" })).toBe("adjunto");
    expect(attachmentMime({ mimeType: "APPLICATION/PDF" })).toBe("application/pdf");
    expect(attachmentMime({ mimeType: "text/html\r\nX: y" })).toBe("application/octet-stream");
    expect(attachmentContentDisposition("Cotización (1)'s.pdf")).toBe(
      "attachment; filename*=UTF-8''Cotizaci%C3%B3n%20%281%29%27s.pdf",
    );
  });
});
