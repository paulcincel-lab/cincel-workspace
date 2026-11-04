import "server-only";

/**
 * Portal "not found" error. Every portal lookup that misses, or that the client
 * may not see, throws it so the route answers 404, never 403. The Drive
 * ancestry guard joins it in this module.
 */

export class PortalNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "No encontrado") {
    super(message);
    this.name = "PortalNotFoundError";
  }
}

export function portalNotFound(): PortalNotFoundError {
  return new PortalNotFoundError();
}

export function isPortalNotFound(error: unknown): error is PortalNotFoundError {
  return error instanceof PortalNotFoundError;
}
