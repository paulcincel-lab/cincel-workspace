"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useSessionAccess } from "@/lib/auth/session-context";

const PUBLIC_LOGIN_ROUTE = "/login";
const PUBLIC_FIRST_ACCESS_ROUTE = "/change-password";
const CONFIG_ROUTE_PREFIX = "/configuracion";

function isPublicRoute(pathname: string): boolean {
  return pathname === PUBLIC_LOGIN_ROUTE || pathname === PUBLIC_FIRST_ACCESS_ROUTE;
}

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
  const isPublic = isPublicRoute(route);
  const isConfigurationRoute = route === CONFIG_ROUTE_PREFIX || route.startsWith(`${CONFIG_ROUTE_PREFIX}/`);

  const canRender = useMemo(() => {
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
  }, [isConfigurationRoute, isMounted, isPublic, resolution.status, resolution.user?.access, route]);

  useEffect(() => {
    if (!isMounted || canRender) {
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
  }, [canRender, isConfigurationRoute, isMounted, resolution.status, resolution.user?.access, router]);

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
