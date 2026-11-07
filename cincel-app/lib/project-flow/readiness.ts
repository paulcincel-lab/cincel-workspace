import type { TramoBoard, ViewerScope } from "@/lib/types/core";

import type { FlowExecutor } from "./db";
import { notImplemented } from "./not-implemented";

/**
 * The "Listos para iniciar" / "Próximos" / started lists of one tramo
 * (BE §9.1, §9.2). One query per bucket with grouped counts; no N+1.
 * Throws `NOT_FOUND` when the workflow is missing or inactive.
 */
export async function tramoBoard(db: FlowExecutor, workflowId: string, viewer: ViewerScope): Promise<TramoBoard> {
  return notImplemented("tramoBoard", db, workflowId, viewer);
}
