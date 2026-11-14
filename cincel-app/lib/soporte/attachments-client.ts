import { uploadTicketAttachmentAction } from "@/lib/actions/soporte-attachment-actions";
import type { TicketAttachment } from "@/lib/types/soporte";

/**
 * Uploads the picked images to a solicitud, one server action per file and in
 * order. Call it after `createTicketAction` / `replyTicketAction` succeed. The
 * solicitud already exists, so a failed image doesn't undo it: `failed` lists
 * each rejected file with its Spanish message for the caller to show.
 */
export async function uploadTicketAttachments(
  ticketId: string,
  files: File[]
): Promise<{ saved: TicketAttachment[]; failed: { name: string; error: string }[] }> {
  const saved: TicketAttachment[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const file of files) {
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadTicketAttachmentAction(ticketId, formData);
    if (result.ok) saved.push(result.data);
    else failed.push({ name: file.name, error: result.error });
  }
  return { saved, failed };
}
