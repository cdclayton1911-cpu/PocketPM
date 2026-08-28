"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { isActivePath, NAV_GROUPS } from "@/lib/nav";
import type { Project } from "@/types";

import { ProjectSwitcher } from "./ProjectSwitcher";

interface SidebarProps {
  projects: Project[];
  activeProject: Project | null;
}

export function Sidebar({ projects, activeProject }: SidebarProps) {
  const pathname = usePathname();

  return (
    // 222px matches the prototype's sidebar width.
    <aside className="flex w-[222px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
      <div className="border-b border-border p-3.5">
        <div className="text-[15px] font-bold text-primary">Pocket PM</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">AI Construction Manager</div>
      </div>

      <nav className="flex-1 pb-2" aria-label="Modules">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // 3px left border on every item, transparent unless active,
                    // so the label never shifts when selection changes.
                    "flex items-center gap-2 border-l-[3px] px-3.5 py-[7px] text-[13px] transition-colors",
                    active
                      ? "border-l-primary bg-accent font-semibold text-primary"
                      : "border-l-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="ml-auto rounded-full bg-danger-subtle px-1.5 py-px text-[10px] font-bold text-danger">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        <ProjectSwitcher projects={projects} activeProject={activeProject} />
      </div>
    </aside>
  );
}
