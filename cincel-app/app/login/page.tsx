import { redirect } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";
import { getAuthFlags } from "@/lib/auth/auth-flags";
import { parseLoginCallbackError } from "@/lib/auth/login-callback-error";
import { getSessionAccess } from "@/lib/auth/session";

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

/**
 * Staff login (frontend spec §2.1, backend spec §A.5.1). Flags are read here on
 * the server and passed down as props; an `active` session goes straight to the
 * dashboard (the middleware no longer does this for any request with a cookie).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const access = await getSessionAccess();
  if (access.status === "active") {
    redirect("/dashboard");
  }

  const { googleEnabled, passwordEnabled } = getAuthFlags();
  const { error } = await searchParams;

  return (
    <LoginForm
      googleEnabled={googleEnabled}
      passwordEnabled={passwordEnabled}
      callbackError={parseLoginCallbackError(error)}
    />
  );
}
