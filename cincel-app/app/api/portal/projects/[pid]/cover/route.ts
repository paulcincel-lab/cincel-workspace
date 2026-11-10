import { handlePortalCoverRequest } from "@/lib/portal/file-route";

type Context = { params: Promise<{ pid: string }> };

/**
 * GET /api/portal/projects/[pid]/cover: the project's cover photo inline (an image inside `02 Cliente`, set by
 * staff in `projects.cover_drive_file_id`). 401 `{ redirect }` without a portal session; 404 without access,
 * without a cover, or when the file is not an image. The Resumen hero falls back to its gradient on 404.
 */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { pid } = await params;
  return handlePortalCoverRequest(pid);
}
