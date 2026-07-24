"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { resolveCurrentSessionAccess } from "@/lib/auth/auth-service";

const PUBLIC_LOGIN_ROUTE = "/login";
const PUBLIC_FIRST_ACCESS_ROUTE = "/change-password";

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

  const route = pathname || "/";
  const resolution = isMounted ? resolveCurrentSessionAccess() : { status: "guest" as const, user: null };
  const isPublic = isPublicRoute(route);

  const canRender = useMemo(() => {
    if (!isMounted) {
      return false;
    }

    if (route === PUBLIC_LOGIN_ROUTE) {
      return resolution.status !== "active" && resolution.status !== "pending_first_access";
    }

    if (route === PUBLIC_FIRST_ACCESS_ROUTE) {
      return resolution.status === "pending_first_access";
    }

    if (!isPublic) {
      return resolution.status === "active";
    }

    return true;
  }, [isMounted, isPublic, resolution.status, route]);

  useEffect(() => {
    if (!isMounted || canRender) {
      return;
    }

    if (resolution.status === "pending_first_access") {
      router.replace(PUBLIC_FIRST_ACCESS_ROUTE);
      return;
    }

    if (resolution.status === "active") {
      router.replace("/dashboard");
      return;
    }

    router.replace(PUBLIC_LOGIN_ROUTE);
  }, [canRender, isMounted, resolution.status, router]);

  if (!canRender) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Validando acceso...</p>
      </main>
    );
  }

  return <>{children}</>;
}
