"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  HardHat,
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
import { ContractorDetailSheet } from "@/components/contacts/ContractorDetailSheet";

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
  company: string;
  notes: string;
};

const EMPTY_FORM: ContactFormData = {
  name: "",
  email: "",
  phone: "",
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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Detail sheet state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedContractor, setSelectedContractor] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    let result = contacts;

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
  }, [contacts, search]);

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

  // Open detail sheet
  const handleOpenDetail = useCallback(async (contactId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSelectedContractor(data);
        setSheetOpen(true);
      }
    } catch (err) {
      console.error("Failed to fetch contractor detail:", err);
    }
  }, []);

  // Save (create or update)
  async function handleSave() {
    if (!form.name.trim()) return;

    setSaving(true);
    try {
      if (editingContact) {
        // Update
        const res = await fetch(`/api/contacts/${editingContact.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, type: "CONTRACTOR" }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update contractor");
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
          body: JSON.stringify({ ...form, type: "CONTRACTOR" }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create contractor");
        }

        const created = await res.json();

        setContacts((prev) =>
          [...prev, {
            ...created,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          }].sort((a: Contact, b: Contact) => a.name.localeCompare(b.name))
        );
      }

      setDialogOpen(false);
      setEditingContact(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (error) {
      console.error("Failed to save contractor:", error);
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
        throw new Error(err.error || "Failed to delete contractor");
      }

      setContacts((prev) => prev.filter((c) => c.id !== deletingContact.id));
      setDeleteDialogOpen(false);
      setDeletingContact(null);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete contractor:", error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contractors</h1>
          <p className="text-sm text-muted-foreground">
            Manage your contractors and their assignments
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="size-4" />
          Add Contractor
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contractors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Contractor Grid */}
      {filteredContacts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <HardHat className="size-8 text-muted-foreground" />
            </div>
            {contacts.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold">No contractors yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add your first contractor to start assigning them to jobs.
                </p>
                <Button className="mt-4" onClick={handleOpenCreate}>
                  <UserPlus className="size-4" />
                  Add Contractor
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">No results found</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  No contractors match your search. Try adjusting your criteria.
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
              className="group relative cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleOpenDetail(contact.id)}
            >
              <CardContent className="pt-4">
                {/* Header row: name */}
                <div className="min-w-0">
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(contact);
                    }}
                  >
                    <Pencil className="size-3" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDelete(contact);
                    }}
                  >
                    <Trash2 className="size-3" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Contractor Detail Sheet */}
      <ContractorDetailSheet
        contractor={selectedContractor}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setSelectedContractor(null);
        }}
        onEditClick={() => {
          setSheetOpen(false);
          if (selectedContractor) {
            const contact = contacts.find((c) => c.id === selectedContractor.id);
            if (contact) handleOpenEdit(contact);
          }
        }}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contractor" : "Add Contractor"}
            </DialogTitle>
            <DialogDescription>
              {editingContact
                ? "Update the contractor details below."
                : "Add a new contractor to your directory."}
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
                  : "Add Contractor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contractor</DialogTitle>
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
