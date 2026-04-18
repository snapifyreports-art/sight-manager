"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package,
  Plus,
  Search,
  Mail,
  Phone,
  User,
  ShoppingCart,
  List,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactNumber: string | null;
  type: string | null;
  accountNumber: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { orders: number; materials: number };
  linkedSites?: Array<{ id: string; name: string; status: string; openOrders: number; totalOrders: number }>;
}

export function SuppliersListClient({ suppliers: initial }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contactName: "", contactEmail: "", contactNumber: "", type: "", accountNumber: "" });
  const [saving, setSaving] = useState(false);

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contactName?.toLowerCase().includes(search.toLowerCase()) ||
    s.type?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const newSupplier = await res.json();
        setSuppliers((prev) => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)));
        setCreateOpen(false);
        setForm({ name: "", contactName: "", contactEmail: "", contactNumber: "", type: "", accountNumber: "" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" /> Add Supplier
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search suppliers..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="mb-2 size-10 opacity-30" />
          <p className="text-sm">
            {search ? "No suppliers match your search" : "No suppliers yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`/suppliers/${s.id}`}
              className="group rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold group-hover:text-blue-600">
                    {s.name}
                  </h3>
                  {s.type && (
                    <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {s.type}
                    </span>
                  )}
                </div>
                <Package className="size-5 flex-shrink-0 text-muted-foreground opacity-30" />
              </div>

              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                {s.contactName && (
                  <div className="flex items-center gap-1.5">
                    <User className="size-3" /> {s.contactName}
                  </div>
                )}
                {s.contactEmail && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="size-3" /> {s.contactEmail}
                  </div>
                )}
                {s.contactNumber && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3" /> {s.contactNumber}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-4 border-t pt-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <List className="size-3" />
                  <span>{s._count.materials} item{s._count.materials !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ShoppingCart className="size-3" />
                  <span>{s._count.orders} order{s._count.orders !== 1 ? "s" : ""}</span>
                </div>
              </div>

              {/* Linked sites — derived from non-cancelled orders */}
              {s.linkedSites && s.linkedSites.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                  <MapPin className="size-3 text-muted-foreground" />
                  {s.linkedSites.map((site) => (
                    <span
                      key={site.id}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        site.openOrders > 0
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                      title={`${site.totalOrders} order${site.totalOrders !== 1 ? "s" : ""} (${site.openOrders} open)`}
                    >
                      {site.name}
                      {site.openOrders > 0 && (
                        <span className="ml-1 font-semibold">· {site.openOrders}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Create Supplier Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Supplier name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Contact Name</label>
                <Input
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Type</label>
                <Input
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  placeholder="e.g. Timber, Electrical"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Email</label>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Phone</label>
                <Input
                  value={form.contactNumber}
                  onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Account Number</label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!form.name.trim() || saving} onClick={handleCreate}>
                {saving ? "Creating..." : "Create Supplier"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
