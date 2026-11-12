import { escapeHtml, heading, htmlDocument, paragraph, type MailContent } from "./layout";

export type OrdenDelDiaParams = {
  title: string;
  /** "jueves 12 nov, 10:00 – 11:00" */
  when: string;
  location: string | null;
  meetUrl: string | null;
  items: string[];
  organizerName: string;
};

/** "Orden del día · {título}" (BE §11.3): when, where and the numbered points. */
export function ordenDelDiaEmail(params: OrdenDelDiaParams): MailContent {
  const { title, when, location, meetUrl, items, organizerName } = params;
  const intro = `${organizerName} envió el orden del día de la reunión.`;
  const details = [when, location ? `Lugar: ${location}` : null, meetUrl ? `Meet: ${meetUrl}` : null].filter(
    (line): line is string => line !== null,
  );

  const text = [intro, "", title, ...details, "", "Orden del día", ...items.map((item, i) => `${i + 1}. ${item}`), ""].join("\n");

  const detailHtml = details
    .map((line) => (line.startsWith("Meet: ") ? `<a href="${escapeHtml(line.slice(6))}" style="color:#111">${escapeHtml(line)}</a>` : escapeHtml(line)))
    .join("<br>");
  const list = `<ol style="margin:0 0 16px;padding-left:20px">${items
    .map((item) => `<li style="margin:0 0 6px">${escapeHtml(item)}</li>`)
    .join("")}</ol>`;

  return {
    subject: `Orden del día · ${title}`,
    text,
    html: htmlDocument([
      paragraph(intro),
      `<p style="margin:0 0 4px;font-weight:600">${escapeHtml(title)}</p>`,
      `<p style="margin:0 0 16px">${detailHtml}</p>`,
      heading("Orden del día"),
      list,
    ]),
  };
}
