/**
 * Release version baked into the build by CI (see the Dockerfile's
 * APP_VERSION build arg), e.g. "0.2.0". Null in local/dev builds, where the
 * hand-typed version from Configuración → General is shown instead.
 */
export const APP_VERSION: string | null = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || null;
