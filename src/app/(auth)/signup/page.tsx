import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card className="rounded-r12">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Create your account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm
          schema="signup"
          endpoint="/api/auth/signup"
          submitLabel="Create account"
          pendingLabel="Creating account…"
          redirectTo="/dashboard"
          fields={[
            { name: "name", label: "Your name", autoComplete: "name", placeholder: "Jane Thompson" },
            {
              name: "company_name",
              label: "Company",
              autoComplete: "organization",
              placeholder: "Acme Construction",
              optional: true,
            },
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
              autoComplete: "new-password",
              placeholder: "At least 8 characters",
            },
            {
              name: "passwordConfirm",
              label: "Confirm password",
              type: "password",
              autoComplete: "new-password",
            },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
