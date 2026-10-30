"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  CHANGE_PASSWORD_ROUTE as PUBLIC_FIRST_ACCESS_ROUTE,
  isPortalPath,
  isPublicPath,
  LOGIN_ROUTE as PUBLIC_LOGIN_ROUTE,
  SIGN_OUT_TO_LOGIN_URL,
} from "@/lib/auth/public-routes";
import { useSessionAccess } from "@/lib/auth/session-context";

const CONFIG_ROUTE_PREFIX = "/configuracion";

export default function AppRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  // Server-resolved access decision, hydrated by the root layout and refreshed
  // via revalidatePath() after the login/logout Server Actions.
  const serverResolution = useSessionAccess();

  const route = pathname || "/";
  const resolution = isMounted
    ? serverResolution
    : { status: "guest" as const, user: null };
  const isPortal = isPortalPath(route);
  const isPublic = isPublicPath(route);
  const isConfigurationRoute = route === CONFIG_ROUTE_PREFIX || route.startsWith(`${CONFIG_ROUTE_PREFIX}/`);

  const canRender = useMemo(() => {
    // The portal layout does its own (portal-cookie) checks; no staff checks here.
    if (isPortal) {
      return true;
    }

    if (!isMounted) {
      return isPublic;
    }

    if (route === PUBLIC_LOGIN_ROUTE) {
      return resolution.status !== "active" && resolution.status !== "pending_first_access";
    }

    if (route === PUBLIC_FIRST_ACCESS_ROUTE) {
      return resolution.status === "pending_first_access";
    }

    if (!isPublic) {
      if (isConfigurationRoute) {
        return resolution.status === "active" && resolution.user?.access === "Administrador";
      }

      return resolution.status === "active";
    }

    return true;
  }, [isConfigurationRoute, isMounted, isPortal, isPublic, resolution.status, resolution.user?.access, route]);

  useEffect(() => {
    if (!isMounted || canRender) {
      return;
    }

    // A guest on a protected path only gets past the middleware with a staff
    // cookie, which is therefore stale (session row missing or expired). A
    // hard navigation through the sign-out route clears it before landing on
    // /login, so the browser can't bounce between the page and /login.
    if (resolution.status === "guest" && !isPublic) {
      window.location.assign(SIGN_OUT_TO_LOGIN_URL);
      return;
    }

    // `router.replace()` is a client-side transition: the App Router keeps
    // reusing the root layout's cached RSC output (and with it the
    // `serverResolution` this guard reads) across it -- the layout only
    // re-runs `getSessionAccess()` (which reads the session cookie against
    // the DB) on a hard navigation, or when something calls
    // `router.refresh()`. Normal login/logout goes through a Server Action
    // that calls `revalidatePath()`, which covers that case -- but if the
    // session becomes invalid for any other reason (the backing DB was
    // reset/reseeded under an already-open tab, the session row expired
    // server-side, etc.), the guard would otherwise keep redirecting based
    // on a decision from before that change and could get stuck bouncing
    // between routes, or stuck rendering "Validando acceso..." here.
    // `router.refresh()` forces that server data to be re-fetched for the
    // destination route, so every redirect this guard issues is always
    // re-checked against the current session/DB state.
    router.refresh();

    if (resolution.status === "pending_first_access") {
      router.replace(PUBLIC_FIRST_ACCESS_ROUTE);
      return;
    }

    if (resolution.status === "active") {
      if (isConfigurationRoute && resolution.user?.access !== "Administrador") {
        router.replace("/dashboard");
        return;
      }

      router.replace("/dashboard");
      return;
    }

    router.replace(PUBLIC_LOGIN_ROUTE);
  }, [canRender, isConfigurationRoute, isMounted, isPublic, resolution.status, resolution.user?.access, router]);

  if (!canRender) {
    if (!isMounted && isPublic) {
      return <>{children}</>;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Validando acceso...</p>
      </main>
    );
  }

  return <>{children}</>;
}
