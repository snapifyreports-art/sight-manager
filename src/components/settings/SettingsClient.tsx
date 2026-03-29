"use client";

import { useState } from "react";
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
import { Settings, User, Bell, Shield, LayoutTemplate, Users } from "lucide-react";
import { PlotTemplatesSection } from "./PlotTemplatesSection";
import { NotificationsSection } from "./NotificationsSection";
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

interface SettingsClientProps {
  user: { name: string; email: string; role: string };
  templates: TemplateData[];
  users: UserData[];
  currentUserId: string;
}

function formatRole(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function SettingsClient({ user, templates, users, currentUserId }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState("general");

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
        onValueChange={(v) => v !== null && setActiveTab(v)}
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
          <UsersClient users={users} currentUserId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
