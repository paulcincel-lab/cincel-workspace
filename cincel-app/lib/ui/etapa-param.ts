/**
 * The stage filter travels as `?etapa=`. Old links and bookmarks carry `?tramo=`
 * (the name before #1127), so every parser reads `etapa` first and falls back to
 * `tramo`, and the proxy rewrites old URLs to the new form.
 */
export const ETAPA_PARAM = "etapa";
/** Compatibility: the previous name of `ETAPA_PARAM`. */
export const LEGACY_TRAMO_PARAM = "tramo";

type ParamReader = { get(name: string): string | null };

/** `etapa`, else the legacy `tramo`; null when neither is present. */
export function readEtapaParam(params: ParamReader | null | undefined): string | null {
  if (!params) return null;
  return params.get(ETAPA_PARAM) ?? params.get(LEGACY_TRAMO_PARAM);
}

/** A page's `searchParams` value (string or string[]) for `etapa`, else the legacy `tramo`. */
export function pickEtapaParam<T>(sp: Record<string, T | undefined>): T | undefined {
  return sp[ETAPA_PARAM] ?? sp[LEGACY_TRAMO_PARAM];
}

/**
 * The same URL with `?tramo=` renamed to `?etapa=` (an `etapa` already present wins),
 * or null when it carries no `tramo`.
 */
export function rewriteLegacyEtapaUrl(url: URL): URL | null {
  if (!url.searchParams.has(LEGACY_TRAMO_PARAM)) return null;
  const next = new URL(url.toString());
  const legacy = next.searchParams.get(LEGACY_TRAMO_PARAM);
  next.searchParams.delete(LEGACY_TRAMO_PARAM);
  if (!next.searchParams.has(ETAPA_PARAM) && legacy !== null) next.searchParams.set(ETAPA_PARAM, legacy);
  return next;
}
