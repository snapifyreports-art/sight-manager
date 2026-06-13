"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, User, Bell, Shield, LayoutTemplate, Users, Palette } from "lucide-react";
import { PlotTemplatesSection } from "./PlotTemplatesSection";
import { NotificationsSection } from "./NotificationsSection";
import { BrandingSection } from "./BrandingSection";
import { UsersClient } from "@/components/users/UsersClient";
import type { TemplateData } from "./types";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  company: string | null;
  phone: string | null;
  /** (May 2026 audit S-P0) Soft-delete timestamp. */
  archivedAt: string | null;
  createdAt: string;
}

interface SiteData {
  id: string;
  name: string;
}

interface SettingsClientProps {
  user: { name: string; email: string; role: string };
  templates: TemplateData[];
  users: UserData[];
  currentUserId: string;
  sites: SiteData[];
  initialTab?: string;
  /** (Jun 2026 audit) Whether the session holds VIEW_USERS — without it
   *  the Users tab (and the user directory it renders) is hidden and the
   *  server passes empty users/sites arrays. */
  hasUsersAccess?: boolean;
  /** (R14) Whether the session holds EDIT_PROGRAMME — without it the
   *  Plot Templates tab (and its content) is hidden and the server
   *  passes an empty templates array. */
  hasTemplatesAccess?: boolean;
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function SettingsClient({ user, templates, users, currentUserId, sites, initialTab, hasUsersAccess = false, hasTemplatesAccess = false }: SettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initial tab resolves from a few sources:
  //   1. ?tab=X if present (refresh / deep link)
  //   2. "templates" if ?tpl=X is set (the user is editing a template,
  //      so they should land on that tab even if ?tab wasn't in the URL)
  //   3. The server-passed `initialTab` (legacy fallback, mirrors #1)
  //   4. "general" default
  // (Jun 2026 review) A ?tab=users deep link from a session WITHOUT
  // VIEW_USERS lands on a tab whose trigger + content are hidden —
  // blank panel, no explanation. Map it back to General.
  // (R14) Same guard for the templates tab when EDIT_PROGRAMME is absent,
  // including the ?tpl= deep-link path that otherwise forces "templates".
  const sanitizeTab = (tab: string) => {
    if (tab === "users" && !hasUsersAccess) return "general";
    if (tab === "templates" && !hasTemplatesAccess) return "general";
    return tab;
  };
  const resolveInitialTab = () => {
    const fromUrl = searchParams?.get("tab");
    if (fromUrl) return sanitizeTab(fromUrl);
    if (searchParams?.get("tpl") && hasTemplatesAccess) return "templates";
    return sanitizeTab(initialTab || "general");
  };
  const [activeTab, setActiveTab] = useState(resolveInitialTab);

  // Sync URL → activeTab on browser back / forward / direct nav.
  useEffect(() => {
    const fromUrl = searchParams?.get("tab");
    const wantTplTab = !!searchParams?.get("tpl") && hasTemplatesAccess;
    const desired = fromUrl ? sanitizeTab(fromUrl) : wantTplTab ? "templates" : null;
    if (desired && desired !== activeTab) {
      setActiveTab(desired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync activeTab → URL when the user changes tabs. Preserves other
  // params (?tpl=X, ?v=Y) so editor state survives the navigation.
  function changeTab(next: string) {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next);
    // Switching tabs implicitly leaves the editor — drop the editor
    // params if we're navigating away from templates.
    if (next !== "templates") {
      params.delete("tpl");
      params.delete("v");
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Settings className="size-6" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your account and application preferences
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => v !== null && changeTab(v)}
      >
        <TabsList variant="line">
          <TabsTrigger value="general">
            <User className="size-4" />
            General
          </TabsTrigger>
          {/* (R14) Plot Templates tab gated on EDIT_PROGRAMME — same
              pattern as the VIEW_USERS-gated Users tab below. */}
          {hasTemplatesAccess && (
            <TabsTrigger value="templates">
              <LayoutTemplate className="size-4" />
              Plot Templates
            </TabsTrigger>
          )}
          <TabsTrigger value="notifications">
            <Bell className="size-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="size-4" />
            Security
          </TabsTrigger>
          {/* (Jun 2026 audit) Users tab gated on VIEW_USERS — every
              VIEW_SETTINGS holder (contractors by default) could read
              the full staff directory (emails, phones) otherwise. */}
          {hasUsersAccess && (
            <TabsTrigger value="users">
              <Users className="size-4" />
              Users
            </TabsTrigger>
          )}
          {/* (May 2026 audit #56) White-label branding. */}
          <TabsTrigger value="branding">
            <Palette className="size-4" />
            Branding
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5" />
                Profile
              </CardTitle>
              <CardDescription>Your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input defaultValue={user.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue={user.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div>
                    <Badge variant="secondary">{formatRole(user.role)}</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plot Templates Tab */}
        {hasTemplatesAccess && (
          <TabsContent value="templates">
            <PlotTemplatesSection initialTemplates={templates} />
          </TabsContent>
        )}

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <NotificationsSection />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5" />
                Security
              </CardTitle>
              <CardDescription>Password and security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Change Password</Label>
                <div className="flex gap-2">
                  <Input type="password" placeholder="New password" disabled />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password management coming soon.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        {hasUsersAccess && (
          <TabsContent value="users">
            <UsersClient users={users} currentUserId={currentUserId} sites={sites} />
          </TabsContent>
        )}

        {/* (May 2026 audit #56) Branding Tab */}
        <TabsContent value="branding">
          <BrandingSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
