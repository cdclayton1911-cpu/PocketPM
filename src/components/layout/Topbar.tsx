"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { titleForPath } from "@/lib/nav";
import type { User } from "@/types";

export function Topbar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // replace(), not push(): the signed-in page must not be reachable with Back.
      router.replace("/login");
      // Clear cached server-component output so nothing renders with stale user data.
      router.refresh();
    }
  }

  const label = user.name || user.email || "Account";

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <h1 className="flex-1 truncate text-[15px] font-semibold">{titleForPath(pathname)}</h1>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[13px]">
            <span className="max-w-[160px] truncate">{label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium">{user.name || "—"}</div>
            {user.email ? (
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSignOut} disabled={signingOut}>
            <LogOut className="size-4" aria-hidden />
            {signingOut ? "Signing out…" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
