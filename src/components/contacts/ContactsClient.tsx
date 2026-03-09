"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Building,
  Phone,
  Mail,
  Plus,
  Search,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// ---------- Types ----------

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "SUPPLIER" | "CONTRACTOR";
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type ContactFormData = {
  name: string;
  email: string;
  phone: string;
  type: "SUPPLIER" | "CONTRACTOR";
  company: string;
  notes: string;
};

const EMPTY_FORM: ContactFormData = {
  name: "",
  email: "",
  phone: "",
  type: "SUPPLIER",
  company: "",
  notes: "",
};

// ---------- Main Component ----------

export function ContactsClient({
  contacts: initialContacts,
}: {
  contacts: Contact[];
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    let result = contacts;

    // Tab filter
    if (activeTab === "suppliers") {
      result = result.filter((c) => c.type === "SUPPLIER");
    } else if (activeTab === "contractors") {
      result = result.filter((c) => c.type === "CONTRACTOR");
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    return result;
  }, [contacts, activeTab, search]);

  // Open create dialog
  function handleOpenCreate() {
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  // Open edit dialog
  function handleOpenEdit(contact: Contact) {
    setEditingContact(contact);
    setForm({
      name: contact.name,
      email: contact.email || "",
      phone: contact.phone || "",
      type: contact.type,
      company: contact.company || "",
      notes: contact.notes || "",
    });
    setDialogOpen(true);
  }

  // Open delete confirmation
  function handleOpenDelete(contact: Contact) {
    setDeletingContact(contact);
    setDeleteDialogOpen(true);
  }

  // Save (create or update)
  async function handleSave() {
    if (!form.name.trim() || !form.type) return;

    setSaving(true);
    try {
      if (editingContact) {
        // Update
        const res = await fetch(`/api/contacts/${editingContact.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update contact");
        }

        const updated = await res.json();

        setContacts((prev) =>
          prev.map((c) => (c.id === updated.id ? {
            ...updated,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          } : c))
        );
      } else {
        // Create
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create contact");
        }

        const created = await res.json();

        setContacts((prev) =>
          [...prev, {
            ...created,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          }].sort((a, b) => a.name.localeCompare(b.name))
        );
      }

      setDialogOpen(false);
      setEditingContact(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (error) {
      console.error("Failed to save contact:", error);
    } finally {
      setSaving(false);
    }
  }

  // Delete
  async function handleDelete() {
    if (!deletingContact) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${deletingContact.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete contact");
      }

      setContacts((prev) => prev.filter((c) => c.id !== deletingContact.id));
      setDeleteDialogOpen(false);
      setDeletingContact(null);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete contact:", error);
    } finally {
      setDeleting(false);
    }
  }

  const supplierCount = contacts.filter((c) => c.type === "SUPPLIER").length;
  const contractorCount = contacts.filter((c) => c.type === "CONTRACTOR").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Manage your suppliers and contractors
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="size-4" />
          Add Contact
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">
              All ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="suppliers">
              Suppliers ({supplierCount})
            </TabsTrigger>
            <TabsTrigger value="contractors">
              Contractors ({contractorCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Contact Grid */}
      {filteredContacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Users className="size-8 text-muted-foreground" />
            </div>
            {contacts.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold">No contacts yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add your first supplier or contractor to start building your
                  contacts directory.
                </p>
                <Button className="mt-4" onClick={handleOpenCreate}>
                  <UserPlus className="size-4" />
                  Add Contact
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">No results found</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No contacts match your current search or filter. Try adjusting
                  your criteria.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((contact) => (
            <Card
              key={contact.id}
              className="group relative transition-shadow hover:shadow-md"
            >
              <CardContent className="pt-4">
                {/* Header row: name + badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {contact.name}
                    </p>
                    {contact.company && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building className="size-3 shrink-0" />
                        <span className="truncate">{contact.company}</span>
                      </div>
                    )}
                  </div>
                  <Badge
                    variant={contact.type === "SUPPLIER" ? "default" : "outline"}
                    className={
                      contact.type === "SUPPLIER"
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        : "bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800"
                    }
                  >
                    {contact.type === "SUPPLIER" ? "Supplier" : "Contractor"}
                  </Badge>
                </div>

                {/* Contact details */}
                <div className="mt-3 space-y-1.5">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="size-3 shrink-0" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-1 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleOpenEdit(contact)}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleOpenDelete(contact)}
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </Button>
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
              {editingContact ? "Edit Contact" : "Add Contact"}
            </DialogTitle>
            <DialogDescription>
              {editingContact
                ? "Update the contact details below."
                : "Add a new supplier or contractor to your directory."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input
                id="contact-name"
                placeholder="e.g. John Smith"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-type">Type *</Label>
              <Select
                value={form.type}
                onValueChange={(val) => {
                  if (val !== null) setForm((prev) => ({
                    ...prev,
                    type: val as "SUPPLIER" | "CONTRACTOR",
                  }));
                }}
              >
                <SelectTrigger className="w-full" id="contact-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPPLIER">Supplier</SelectItem>
                  <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-company">Company</Label>
              <Input
                id="contact-company"
                placeholder="e.g. ABC Building Ltd"
                value={form.company}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, company: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  placeholder="07700 000000"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving
                ? "Saving..."
                : editingContact
                  ? "Save Changes"
                  : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deletingContact?.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
