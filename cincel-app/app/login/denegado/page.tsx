import Link from "next/link";

import { buttonVariants } from "@/components/ui/shadcn/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { getDenialMessage } from "@/lib/auth/denial-messages";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Landing page for refused Google staff sign-ins (FE §2.2). Public route; it never
 * reads the staff session, so a stale cookie can't bounce it.
 */
export default async function LoginDeniedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const message = getDenialMessage(firstValue(params.motivo), {
    domain: process.env.GOOGLE_WORKSPACE_DOMAIN,
    email: firstValue(params.email),
  });

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
