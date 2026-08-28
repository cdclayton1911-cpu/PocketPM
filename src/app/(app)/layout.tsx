import { requireSession } from "@/lib/session";

/**
 * Guard for every module route.
 *
 * `proxy.ts` already redirects unauthenticated requests, but that check is
 * optimistic — it only decodes the token's expiry without verifying the
 * signature. This is the authoritative one: requireSession() asks PocketBase to
 * validate the token, so a forged or revoked token gets no further than here.
 *
 * The sidebar/topbar shell replaces this placeholder in the next step.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireSession();

  return <div className="flex min-h-screen flex-col">{children}</div>;
}
