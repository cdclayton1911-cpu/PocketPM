import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return (
    <Card className="rounded-r12">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Reset your password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Enter the address you signed up with and we&apos;ll send a link to set a new password.
        </p>
        <AuthForm
          schema="passwordResetRequest"
          endpoint="/api/auth/password-reset"
          submitLabel="Send reset link"
          pendingLabel="Sending…"
          // No redirect: the handler cannot say whether the account exists, so
          // there is nowhere meaningful to send the user.
          successMessage="If an account exists for that address, a reset link is on its way. Check your spam folder if it does not arrive within a few minutes."
          fields={[
            {
              name: "email",
              label: "Email",
              type: "email",
              autoComplete: "email",
              placeholder: "you@company.com",
            },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
