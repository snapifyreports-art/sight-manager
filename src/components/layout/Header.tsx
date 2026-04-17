"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { LogOut, User, CalendarDays, ClipboardCheck, BarChart3, Search } from "lucide-react";
import { SearchModal } from "./SearchModal";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { MobileSidebar, MobileSiteBar } from "./Sidebar";
import { DevModeToolbar } from "@/components/dev/DevModeToolbar";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tasks": "Tasks",
  "/sites": "Sites",
  "/orders": "Orders",
  "/contacts": "Contacts",
  "/events-log": "Events Log",
  "/analytics": "Analytics",
  "/users": "Users",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path)) return title;
  }
  return "Dashboard";
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function useSiteId(pathname: string): string | null {
  const [storedSiteId, setStoredSiteId] = useState<string | null>(null);

  // Extract from URL: /sites/[siteId]/...
  const match = pathname.match(/^\/sites\/([^/]+)/);
  const urlSiteId = match ? match[1] : null;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sight-manager-last-site");
      if (stored) setStoredSiteId(stored);
    } catch {}
  }, []);

  return urlSiteId || storedSiteId;
}

export function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const pageTitle = getPageTitle(pathname);
  const siteId = useSiteId(pathname);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="shrink-0">
    <div className="flex h-14 items-center gap-3 border-b border-border/50 bg-white px-4">
      <MobileSidebar />

      <h1 className="text-sm font-semibold text-slate-700">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-2">
        {siteId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="flex gap-1.5 px-1.5 sm:px-2 text-xs text-muted-foreground"
              render={<Link href={`/sites/${siteId}?tab=daily-brief`} />}
            >
              <CalendarDays className="size-4 sm:size-3.5" />
              <span className="hidden sm:inline">Brief</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex gap-1.5 px-1.5 sm:px-2 text-xs text-muted-foreground"
              render={<Link href={`/sites/${siteId}?tab=programme`} />}
            >
              <BarChart3 className="size-4 sm:size-3.5" />
              <span className="hidden sm:inline">Prog</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex gap-1.5 px-1.5 sm:px-2 text-xs text-muted-foreground"
              render={<Link href={`/sites/${siteId}/walkthrough`} />}
            >
              <ClipboardCheck className="size-4 sm:size-3.5" />
              <span className="hidden sm:inline">Walk</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex gap-1.5 px-1.5 sm:px-2 text-xs text-muted-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-4 sm:size-3.5" />
              <span className="hidden lg:inline text-[10px] text-muted-foreground/60">⌘K</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
          </>
        )}
        <div className="hidden"><DevModeToolbar /></div>
        {session?.user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 px-2 hover:bg-slate-100"
                />
              }
            >
              <Avatar size="sm">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-[10px] font-semibold text-white">
                  {getInitials(session.user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-[13px] font-medium text-slate-700 sm:inline-block">
                {session.user.name}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={8}>
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {session.user.name}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {session.user.email}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {formatRole(session.user.role)}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
    <MobileSiteBar />
    <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} siteId={siteId} />
    </header>
  );
}
