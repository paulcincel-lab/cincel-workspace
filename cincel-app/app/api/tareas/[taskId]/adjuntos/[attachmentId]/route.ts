import { NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import * as tasksRepository from "@/lib/repositories/tasks-repository";

/**
 * GET /api/tareas/[taskId]/adjuntos/[attachmentId] — streams back the bytes
 * of a task attachment (#425). Any authenticated user can fetch one, the
 * same gate `addTaskCommentAction`/`fetchTaskAction` use elsewhere for task
 * comments and detail — attachments are just a kind of comment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string; attachmentId: string }> }
): Promise<NextResponse> {
  try {
    await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { taskId, attachmentId } = await params;
  const attachment = await tasksRepository.getTaskAttachmentData(attachmentId);
  if (!attachment || attachment.taskId !== taskId) {
    return NextResponse.json({ error: "Adjunto no encontrado." }, { status: 404 });
  }

  const isInline = attachment.mimeType.startsWith("image/");
  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${encodeURIComponent(attachment.fileName)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
