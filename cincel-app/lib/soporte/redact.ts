/**
 * Redaction before a solicitud goes to the public GitHub repository (#1116).
 * Stub: returns the text unchanged until #1116 implements it.
 */

/** What the redaction knows about the app: names to replace with a placeholder. */
export type RedactionContext = {
  staffNames: string[];
  contactNames: string[];
  clientNames: string[];
  projectNames: string[];
};

export type RedactionResult = { text: string; changed: boolean };

/** Removes emails, phones, known names and URLs other than the app's own paths. */
export function redactForGithub(text: string, _context: RedactionContext): RedactionResult {
  return { text, changed: false };
}
