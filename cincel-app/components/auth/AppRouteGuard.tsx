"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { resolveCurrentSessionAccess } from "@/lib/auth/auth-service";

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

  // resolveCurrentSessionAccess() is recomputed on every render, but nothing
  // triggers a render when the underlying auth state changes asynchronously
  // (e.g. in Supabase mode, the initial getSession() check resolving after
  // mount). Every other consumer of the auth session in this app refreshes
  // on the "storage"/"focus" window events, so we subscribe to the same
  // events here to force a re-render and re-evaluate access once the
  // session state settles.
  const [, forceRefresh] = useState(0);
  useEffect(() => {
    const handleAuthStateSignal = () => forceRefresh((count) => count + 1);
    window.addEventListener("storage", handleAuthStateSignal);
    window.addEventListener("focus", handleAuthStateSignal);
    return () => {
      window.removeEventListener("storage", handleAuthStateSignal);
      window.removeEventListener("focus", handleAuthStateSignal);
    };
  }, []);

  const route = pathname || "/";
  const resolution = isMounted ? resolveCurrentSessionAccess() : { status: "guest" as const, user: null };
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
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Validando acceso...</p>
      </main>
    );
  }

  return <>{children}</>;
}
