/**
 * The stage filter travels as `?etapa=`. Old links and bookmarks carry `?tramo=`
 * (the name before #1127), so every parser reads `etapa` first and falls back to
 * `tramo`, and the proxy rewrites old URLs to the new form.
 */
export const ETAPA_PARAM = "etapa";
/** Compatibility: the previous name of `ETAPA_PARAM`. */
export const LEGACY_TRAMO_PARAM = "tramo";

/** The "no etapa" filter value in URLs. */
export const NO_ETAPA_PARAM_VALUE = "sin-etapa";
/** Compatibility: the previous value of `NO_ETAPA_PARAM_VALUE`, still in old links and bookmarks. */
const LEGACY_SIN_TRAMO = "sin-tramo";

/** `sin-tramo` (old links) reads as `sin-etapa`; any other value is unchanged. */
export function normalizeEtapaValue<T extends string | null | undefined>(value: T): T {
  return (value === LEGACY_SIN_TRAMO ? NO_ETAPA_PARAM_VALUE : value) as T;
}

type ParamReader = { get(name: string): string | null };

/** `etapa`, else the legacy `tramo`; null when neither is present. */
export function readEtapaParam(params: ParamReader | null | undefined): string | null {
  if (!params) return null;
  return normalizeEtapaValue(params.get(ETAPA_PARAM) ?? params.get(LEGACY_TRAMO_PARAM));
}

/** A page's `searchParams` value (string or string[]) for `etapa`, else the legacy `tramo`. */
export function pickEtapaParam<T>(sp: Record<string, T | undefined>): T | undefined {
  const value = sp[ETAPA_PARAM] ?? sp[LEGACY_TRAMO_PARAM];
  if (typeof value === "string") return normalizeEtapaValue(value) as T;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? normalizeEtapaValue(v) : v)) as T;
  return value;
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
