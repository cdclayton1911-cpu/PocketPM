import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/validation/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;

  // `next` is attacker-controllable, so it is normalised here rather than
  // handed to the client as-is. Anything off-origin falls back to /dashboard.
  const redirectTo = safeRedirectPath(next);

  return (
    <Card className="rounded-r12">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Sign in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm
          schema="login"
          endpoint="/api/auth/login"
          submitLabel="Sign in"
          pendingLabel="Signing in…"
          redirectTo={redirectTo}
          fields={[
            {
              name: "email",
              label: "Email",
              type: "email",
              autoComplete: "email",
              placeholder: "you@company.com",
            },
            {
              name: "password",
              label: "Password",
              type: "password",
              autoComplete: "current-password",
            },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
