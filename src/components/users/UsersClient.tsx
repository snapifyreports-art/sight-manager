"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UserCog,
  Plus,
  Search,
  Pencil,
  Trash2,
  Shield,
  Mail,
  MailPlus,
  Phone,
  Building,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_META, ALL_PERMISSIONS } from "@/lib/permissions";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirmAction } from "@/hooks/useConfirmAction";

// ---------- Types ----------

interface SiteData {
  id: string;
  name: string;
}

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

type UserFormData = {
  name: string;
  email: string;
  password: string;
  role: string;
  jobTitle: string;
  company: string;
  phone: string;
};

const EMPTY_FORM: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "CONTRACTOR",
  jobTitle: "",
  company: "",
  phone: "",
};

const ROLES = [
  { value: "CEO", label: "CEO" },
  { value: "DIRECTOR", label: "Director" },
  { value: "SITE_MANAGER", label: "Site Manager" },
  { value: "CONTRACT_MANAGER", label: "Contract Manager" },
  { value: "CONTRACTOR", label: "Contractor" },
];

function formatRole(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

const ROLE_COLORS: Record<string, string> = {
  CEO: "bg-purple-500/10 text-purple-700",
  DIRECTOR: "bg-blue-500/10 text-blue-700",
  SITE_MANAGER: "bg-green-500/10 text-green-700",
  CONTRACT_MANAGER: "bg-amber-500/10 text-amber-700",
  CONTRACTOR: "bg-slate-500/10 text-slate-700",
};

// ---------- Permissions Dialog ----------

function PermissionsDialog({
  open,
  onOpenChange,
  user,
  sites,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserData | null;
  sites: SiteData[];
}) {
  const toast = useToast();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [assignedSiteIds, setAssignedSiteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "CEO" || user?.role === "DIRECTOR";

  const fetchPermissions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`);
      if (res.ok) {
        const data = await res.json();
        // API returns { permissions: string[], siteIds: string[] }
        if (Array.isArray(data.permissions)) {
          setPermissions(data.permissions);
          setAssignedSiteIds(data.siteIds || []);
        } else if (Array.isArray(data)) {
          // Legacy format — just permissions array
          setPermissions(data);
          setAssignedSiteIds([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch permissions:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      fetchPermissions();
    }
  }, [open, user, fetchPermissions]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions,
          siteIds: isAdmin ? undefined : assignedSiteIds,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to save permissions"));
        return;
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(key: string, enabled: boolean) {
    setPermissions((prev) =>
      enabled ? [...prev, key] : prev.filter((p) => p !== key)
    );
  }

  function toggleSite(siteId: string, enabled: boolean) {
    setAssignedSiteIds((prev) =>
      enabled ? [...prev, siteId] : prev.filter((id) => id !== siteId)
    );
  }

  const pagePermissions = ALL_PERMISSIONS.filter(
    (p) => PERMISSION_META[p].group === "page"
  );
  const actionPermissions = ALL_PERMISSIONS.filter(
    (p) => PERMISSION_META[p].group === "action"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5" />
            Permissions
          </DialogTitle>
          <DialogDescription>
            Manage permissions for{" "}
            <span className="font-medium text-foreground">{user?.name}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-6 overflow-y-auto py-2">
            {/* Site Access */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Site Access
              </h4>
              {isAdmin ? (
                <p className="text-xs text-muted-foreground italic">
                  All Sites (Admin) — {formatRole(user?.role || "")} users automatically have access to all sites.
                </p>
              ) : sites.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sites available.</p>
              ) : (
                <div className="space-y-3">
                  {sites.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{site.name}</p>
                      </div>
                      <Switch
                        checked={assignedSiteIds.includes(site.id)}
                        onCheckedChange={(checked) =>
                          toggleSite(site.id, checked)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Page Access */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Page Access
              </h4>
              <div className="space-y-3">
                {pagePermissions.map((key) => {
                  const meta = PERMISSION_META[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.description}
                        </p>
                      </div>
                      <Switch
                        checked={permissions.includes(key)}
                        onCheckedChange={(checked) =>
                          togglePermission(key, checked)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </h4>
              <div className="space-y-3">
                {actionPermissions.map((key) => {
                  const meta = PERMISSION_META[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.description}
                        </p>
                      </div>
                      <Switch
                        checked={permissions.includes(key)}
                        onCheckedChange={(checked) =>
                          togglePermission(key, checked)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main Component ----------

export function UsersClient({
  users: initialUsers,
  currentUserId,
  sites,
}: {
  users: UserData[];
  currentUserId: string;
  sites: SiteData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<UserData | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Confirm-delete flow shared via useConfirmAction.
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.company && u.company.toLowerCase().includes(q)) ||
        formatRole(u.role).toLowerCase().includes(q)
    );
  }, [users, search]);

  // Open create dialog
  function handleOpenCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  // (May 2026 audit O-3) Resend the invite/password-reset email for a
  // user. Hits the existing /api/auth/request-reset endpoint, which is
  // explicitly designed to double as a "resend invite" entry point —
  // same token + URL + email as the welcome flow. Pre-fix the UI had
  // no surface for this, so admins had to manually share passwords or
  // re-create users.
  async function handleResendInvite(user: UserData) {
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) {
        throw new Error(await fetchErrorMessage(res, "Failed to resend invite"));
      }
      toast.success(`Invite resent to ${user.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend invite");
    }
  }

  // Open edit dialog
  function handleOpenEdit(user: UserData) {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      jobTitle: user.jobTitle || "",
      company: user.company || "",
      phone: user.phone || "",
    });
    setDialogOpen(true);
  }

  // Open delete confirmation via the shared hook.
  function handleOpenDelete(user: UserData) {
    confirmAction({
      title: "Delete User",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="font-medium text-foreground">{user.name}</span>?
          This will remove their account and all associated data. This action
          cannot be undone.
        </>
      ),
      confirmLabel: "Delete User",
      onConfirm: async () => {
        const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(await fetchErrorMessage(res, "Failed to delete user"));
        }
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        toast.success(`${user.name} deleted`);
        router.refresh();
      },
    });
  }

  // Open permissions dialog
  function handleOpenPermissions(user: UserData) {
    setPermissionsUser(user);
    setPermissionsDialogOpen(true);
  }

  // Save (create or update)
  async function handleSave() {
    if (!form.name.trim() || !form.email.trim() || !form.role) return;
    if (!editingUser && !form.password.trim()) return;

    setSaving(true);
    try {
      if (editingUser) {
        const payload: Record<string, string> = {
          name: form.name,
          email: form.email,
          role: form.role,
          jobTitle: form.jobTitle,
          company: form.company,
          phone: form.phone,
        };
        if (form.password.trim()) {
          payload.password = form.password;
        }

        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to update user"));
          return;
        }

        const updated = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === updated.id ? { ...updated } : u))
        );
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to create user"));
          return;
        }

        const created = await res.json();
        setUsers((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        );
      }

      setDialogOpen(false);
      setEditingUser(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  // handleDelete lives inside handleOpenDelete's onConfirm closure now.

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <UserCog className="size-6" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage users, roles, and permissions
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="size-4" />
          Add User
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* User Grid */}
      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <UserCog className="size-8 text-muted-foreground" />
            </div>
            {users.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold">No users yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add your first user to get started.
                </p>
                <Button className="mt-4" onClick={handleOpenCreate}>
                  <UserPlus className="size-4" />
                  Add User
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">No results found</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No users match your search. Try adjusting your criteria.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((user) => (
            <Card
              key={user.id}
              className="group relative transition-shadow hover:shadow-md"
            >
              <CardContent className="pt-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (You)
                        </span>
                      )}
                    </p>
                    {user.jobTitle && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {user.jobTitle}
                      </p>
                    )}
                  </div>
                  <Badge className={ROLE_COLORS[user.role] || ""}>
                    {formatRole(user.role)}
                  </Badge>
                </div>

                {/* Details */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="size-3 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  {user.company && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Building className="size-3 shrink-0" />
                      <span className="truncate">{user.company}</span>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="size-3 shrink-0" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleOpenEdit(user)}
                  >
                    <Pencil className="size-3" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleOpenPermissions(user)}
                  >
                    <Shield className="size-3" />
                    <span className="hidden sm:inline">Permissions</span>
                  </Button>
                  {user.id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleResendInvite(user)}
                      title="Resend invite / password-reset email"
                    >
                      <MailPlus className="size-3" />
                      <span className="hidden sm:inline">Resend invite</span>
                    </Button>
                  )}
                  {user.id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleOpenDelete(user)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Edit User" : "Add User"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update the user details below."
                : "Create a new user account."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">Name *</Label>
              <Input
                id="user-name"
                placeholder="e.g. John Smith"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">Email *</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-password">
                Password {editingUser ? "(leave blank to keep)" : "*"}
              </Label>
              <Input
                id="user-password"
                type="password"
                placeholder={editingUser ? "••••••••" : "Min 8 characters"}
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role">Role *</Label>
              <Select
                value={form.role}
                onValueChange={(val) => {
                  if (val !== null)
                    setForm((prev) => ({ ...prev, role: val }));
                }}
              >
                <SelectTrigger className="w-full" id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-job-title">Job Title</Label>
              <Input
                id="user-job-title"
                placeholder="e.g. Site Manager"
                value={form.jobTitle}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, jobTitle: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-company">Company</Label>
                <Input
                  id="user-company"
                  placeholder="e.g. Sight Manager Ltd"
                  value={form.company}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, company: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-phone">Phone</Label>
                <Input
                  id="user-phone"
                  type="tel"
                  placeholder="07700 000000"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !form.name.trim() ||
                !form.email.trim() ||
                (!editingUser && !form.password.trim())
              }
            >
              {saving
                ? "Saving..."
                : editingUser
                  ? "Save Changes"
                  : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared confirm-delete dialog (useConfirmAction) */}
      {confirmDialogs}

      {/* Permissions Dialog */}
      <PermissionsDialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
        user={permissionsUser}
        sites={sites}
      />
    </div>
  );
}
