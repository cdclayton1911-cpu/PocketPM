import { redirect } from "next/navigation";

/**
 * The app has no marketing landing page — `/` is just the way in.
 *
 * Unauthenticated visitors never reach this: `src/proxy.ts` bounces them to
 * /login first. So this only runs for a signed-in user, and sends them to the
 * dashboard rather than rendering anything of its own.
 *
 * Replaces the scaffold-check page that verified the theme and shadcn wiring
 * during setup. That served its purpose and has no business being the landing
 * page; the same badges are exercised for real by StatusBadge across the
 * modules now.
 */
export default function Home() {
  redirect("/dashboard");
}
