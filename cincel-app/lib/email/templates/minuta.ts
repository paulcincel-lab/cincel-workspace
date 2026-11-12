import { escapeHtml, heading, htmlDocument, paragraph, type MailContent } from "./layout";

export type MinutaParams = {
  title: string;
  when: string;
  decisions: string[];
  tasks: { title: string; owner: string | null; date: string | null }[];
  nextMeeting: string | null;
  organizerName: string;
};

function taskLine(task: MinutaParams["tasks"][number]): string {
  const parts = [task.title];
  if (task.owner) parts.push(task.owner);
  if (task.date) parts.push(task.date);
  return parts.join(" · ");
}

function list(items: string[]): string {
  const rows = items.map((item) => `<li style="margin:0 0 6px">${escapeHtml(item)}</li>`).join("");
  return `<ul style="margin:0 0 16px;padding-left:20px">${rows}</ul>`;
}

/** "Minuta · {título}" (BE §11.3): decisions, tasks with owner and date, and the next meeting. */
export function minutaEmail(params: MinutaParams): MailContent {
  const title = params.title.replace(/\s+/g, " ").trim();
  const intro = `${params.organizerName} comparte la minuta de la reunión "${title}" (${params.when}).`;
  const taskLines = params.tasks.map(taskLine);

  const text: string[] = [intro, ""];
  const html: string[] = [paragraph(intro)];

  if (params.decisions.length > 0) {
    text.push("Decisiones", ...params.decisions.map((d) => `- ${d}`), "");
    html.push(heading("Decisiones"), list(params.decisions));
  }
  if (taskLines.length > 0) {
    text.push("Tareas", ...taskLines.map((t) => `- ${t}`), "");
    html.push(heading("Tareas"), list(taskLines));
  }
  if (params.nextMeeting) {
    const next = `Próxima junta: ${params.nextMeeting}.`;
    text.push(next, "");
    html.push(paragraph(next));
  }

  return { subject: `Minuta · ${title}`, text: text.join("\n"), html: htmlDocument(html) };
}
