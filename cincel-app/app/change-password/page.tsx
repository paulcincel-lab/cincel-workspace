import { redirect } from "next/navigation";

import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
import { isPasswordAuthEnabled } from "@/lib/auth/auth-flags";
import { LOGIN_ROUTE, SIGN_OUT_TO_LOGIN_URL } from "@/lib/auth/public-routes";
import { getSessionAccess } from "@/lib/auth/session";

/**
 * First-access password change (backend spec §A.5.1). Only reachable for a
 * `pending_first_access` session while AUTH_PASSWORD_ENABLED is on; otherwise
 * it redirects once and never back and forth.
 */
export default async function ChangePasswordPage() {
  const access = await getSessionAccess();

  if (access.status === "active") {
    redirect("/dashboard");
  }

  if (access.status === "pending_first_access") {
    if (isPasswordAuthEnabled()) {
      return <ChangePasswordForm />;
    }
    // With passwords off the session can never finish first access, and the
    // route guard sends it from /login back here; clearing it ends on /login.
    redirect(SIGN_OUT_TO_LOGIN_URL);
  }

  redirect(LOGIN_ROUTE);
}
