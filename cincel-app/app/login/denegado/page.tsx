import Link from "next/link";
import { LockKeyhole, Mail } from "lucide-react";

import { AuthCenteredLayout } from "@/components/auth/AuthSplitLayout";
import { buttonVariants } from "@/components/ui/shadcn/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { adminContactHref, getAdminContactEmail, isAuthRedesignOn } from "@/lib/auth/auth-appearance";
import { getDenialMessage } from "@/lib/auth/denial-messages";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Landing page for refused Google staff sign-ins (FE §2.2). Public route; it never
 * reads the staff session, so a stale cookie can't bounce it. The look follows
 * the org setting (redesign FE §3.10): the redesign card shows the email that
 * was refused, "Usar otra cuenta" and, when General settings has a
 * `contactEmail`, "Contactar al administrador".
 */
export default async function LoginDeniedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const email = firstValue(params.email)?.trim() || undefined;
  const message = getDenialMessage(firstValue(params.motivo), {
    domain: process.env.GOOGLE_WORKSPACE_DOMAIN,
    email,
  });

  if (await isAuthRedesignOn()) {
    const contactEmail = await getAdminContactEmail();
    return <RedesignDenied message={message} email={email} contactEmail={contactEmail} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No pudimos darte acceso</CardTitle>
          <CardDescription role="alert">{message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className={buttonVariants()}>
            Volver a intentar
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}

function RedesignDenied({
  message,
  email,
  contactEmail,
}: {
  message: string;
  email: string | undefined;
  contactEmail: string;
}) {
  return (
    <AuthCenteredLayout>
      <Card className="items-center text-center">
        <CardHeader className="w-full justify-items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          >
            <LockKeyhole className="size-6" />
          </span>
          <CardTitle>
            <h1 className="text-[22px] font-semibold">Tu cuenta no tiene acceso</h1>
          </CardTitle>
          <CardDescription role="alert" className="text-[15px] leading-relaxed">
            {message}
          </CardDescription>
        </CardHeader>
        {email ? (
          <CardContent className="w-full">
            <div
              data-testid="denied-email"
              className="flex items-center gap-3 rounded-lg border border-border bg-muted px-3.5 py-2.5 text-left"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground"
              >
                <Mail className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">Cuenta con la que entraste</span>
                <span className="truncate font-mono text-[13px] text-muted-foreground">{email}</span>
              </span>
            </div>
          </CardContent>
        ) : null}
        <CardFooter className="w-full flex-col gap-2">
          <Link href="/login" className={buttonVariants({ size: "lg", className: "h-10 w-full" })}>
            Usar otra cuenta
          </Link>
          {contactEmail ? (
            <a
              href={adminContactHref(contactEmail)}
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 w-full" })}
            >
              Contactar al administrador
            </a>
          ) : null}
        </CardFooter>
      </Card>
    </AuthCenteredLayout>
  );
}
