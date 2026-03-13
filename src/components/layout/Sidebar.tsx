"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  HardHat,
  LayoutDashboard,
  ClipboardList,
  Building2,
  ShoppingCart,
  Package,
  Users,
  ScrollText,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_PERMISSION_MAP } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: ClipboardList },
  { label: "Sites", href: "/sites", icon: Building2 },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Suppliers", href: "/suppliers", icon: Package },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Events Log", href: "/events-log", icon: ScrollText },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Users", href: "/users", icon: UserCog },
  { label: "Settings", href: "/settings", icon: Settings },
];

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

function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("flex h-16 items-center gap-3 px-4", collapsed && "justify-center px-2")}>
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
            <HardHat className="size-5" />
          </div>
          {!collapsed && (
            <span className="text-[15px] font-bold tracking-tight text-foreground">
              Sight Manager
            </span>
          )}
        </Link>
      </div>

      {/* Nav Links */}
      <ScrollArea className="flex-1 py-2">
        <nav className={cn("flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
          {navItems.filter((item) => {
            const requiredPermission = NAV_PERMISSION_MAP[item.href];
            if (!requiredPermission) return true;
            const userPermissions = (session?.user as { permissions?: string[] })?.permissions;
            if (!userPermissions) return true;
            return userPermissions.includes(requiredPermission);
          }).map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-gradient-to-r from-blue-600/[0.12] to-blue-600/[0.04] text-blue-700 shadow-sm shadow-blue-600/5"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                {isActive && !collapsed && (
                  <div className="absolute left-0 h-6 w-[3px] rounded-r-full bg-blue-600" />
                )}
                <Icon className={cn(
                  "size-[18px] shrink-0 transition-colors",
                  isActive ? "text-blue-600" : "text-muted-foreground/70 group-hover:text-foreground"
                )} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger render={linkContent} />
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.href} className="relative">{linkContent}</div>;
          })}
        </nav>
      </ScrollArea>

      {/* User Section */}
      <div className="border-t border-border/50 p-3">
        {session?.user && (
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40",
              collapsed && "flex-col gap-2 p-1"
            )}
          >
            <Avatar size="sm">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-[11px] font-semibold text-white">
                {getInitials(session.user.name)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-[13px] font-semibold">
                  {session.user.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {formatRole(session.user.role)}
                </span>
              </div>
            )}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => signOut({ callbackUrl: "/login" })}
                    />
                  }
                >
                  <LogOut className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden h-screen flex-col border-r border-border/50 bg-gradient-to-b from-white to-slate-50/80 transition-all duration-300 md:flex",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      <div className="relative flex-1 overflow-hidden">
        <SidebarNav collapsed={collapsed} />
        <Button
          variant="outline"
          size="icon-xs"
          className="absolute -right-3 top-[22px] z-10 rounded-full border bg-white shadow-sm hover:shadow-md transition-shadow"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft
            className={cn(
              "size-3 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </Button>
      </div>
    </aside>
  );
}

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" />
        }
      >
        <Menu className="size-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav />
      </SheetContent>
    </Sheet>
  );
}
