"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";
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
import { MobileSidebar } from "./Sidebar";
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

export function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-white px-4">
      <MobileSidebar />

      <h1 className="text-sm font-semibold text-slate-700">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-2">
        <DevModeToolbar />
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
    </header>
  );
}
