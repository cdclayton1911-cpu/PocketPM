import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The page the emailed link lands on. The token rides in `?token=`.
 *
 * A missing token is handled here rather than at submit time: the user followed
 * a broken or truncated link, and telling them so immediately is better than an
 * empty form that can only fail.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <Card className="rounded-r12">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Set a new password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {token ? (
          <AuthForm
            schema="passwordResetConfirm"
            endpoint="/api/auth/password-reset/confirm"
            submitLabel="Set new password"
            pendingLabel="Saving…"
            hidden={{ token }}
            successMessage="Password updated. You can sign in with it now."
            fields={[
              {
                name: "password",
                label: "New password",
                type: "password",
                autoComplete: "new-password",
              },
              {
                name: "passwordConfirm",
                label: "Confirm new password",
                type: "password",
                autoComplete: "new-password",
              },
            ]}
          />
        ) : (
          <p
            role="alert"
            className="rounded-r6 border-l-[3px] border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            This link is missing its reset token. It may have been truncated by your email client —
            request a new one.
          </p>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Request a new link
          </Link>
          {" · "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
