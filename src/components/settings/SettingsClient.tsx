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
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function SettingsClient({ user, templates, users, currentUserId, sites, initialTab }: SettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initial tab resolves from a few sources:
  //   1. ?tab=X if present (refresh / deep link)
  //   2. "templates" if ?tpl=X is set (the user is editing a template,
  //      so they should land on that tab even if ?tab wasn't in the URL)
  //   3. The server-passed `initialTab` (legacy fallback, mirrors #1)
  //   4. "general" default
  const resolveInitialTab = () => {
    const fromUrl = searchParams?.get("tab");
    if (fromUrl) return fromUrl;
    if (searchParams?.get("tpl")) return "templates";
    return initialTab || "general";
  };
  const [activeTab, setActiveTab] = useState(resolveInitialTab);

  // Sync URL → activeTab on browser back / forward / direct nav.
  useEffect(() => {
    const fromUrl = searchParams?.get("tab");
    const wantTplTab = !!searchParams?.get("tpl");
    const desired = fromUrl ?? (wantTplTab ? "templates" : null);
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
          <TabsTrigger value="templates">
            <LayoutTemplate className="size-4" />
            Plot Templates
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="size-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="size-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="size-4" />
            Users
          </TabsTrigger>
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
        <TabsContent value="templates">
          <PlotTemplatesSection initialTemplates={templates} />
        </TabsContent>

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
        <TabsContent value="users">
          <UsersClient users={users} currentUserId={currentUserId} sites={sites} />
        </TabsContent>

        {/* (May 2026 audit #56) Branding Tab */}
        <TabsContent value="branding">
          <BrandingSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
