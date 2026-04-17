"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Upload,
  Plus,
  Pencil,
  Trash2,
  Search,
  Mail,
  Phone,
  User,
  Hash,
  Package,
  Check,
  X,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------- Types ----------

interface MaterialItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  category: string | null;
  sku: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactNumber: string | null;
  type: string | null;
  emailTemplate: string | null;
  accountNumber: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { orders: number };
  materials: MaterialItem[];
  performance: {
    totalOrders: number;
    totalDelivered: number;
    onTimeRate: number | null;
    avgDaysDelta: number | null;
  };
}

// ---------- Helpers ----------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

// ---------- Component ----------

export function SupplierDetailClient({ supplier: initial }: { supplier: Supplier }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supplier state
  const [supplier, setSupplier] = useState(initial);
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: initial.name,
    contactName: initial.contactName || "",
    contactEmail: initial.contactEmail || "",
    contactNumber: initial.contactNumber || "",
    type: initial.type || "",
    accountNumber: initial.accountNumber || "",
  });

  // Pricelist state
  const [items, setItems] = useState<MaterialItem[]>(initial.materials);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", unit: "each", unitCost: "", category: "", sku: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", unit: "", unitCost: "", category: "", sku: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase()) ||
    i.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];

  // ── Supplier Edit ──
  const handleUpdateSupplier = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setSupplier((s) => ({ ...s, ...updated }));
        setEditSupplierOpen(false);
        showToast("Supplier updated");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Add Item ──
  const handleAddItem = async () => {
    if (!addForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/pricelist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          unit: addForm.unit || "each",
          unitCost: parseFloat(addForm.unitCost) || 0,
          category: addForm.category || null,
          sku: addForm.sku || null,
        }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
        setAddOpen(false);
        setAddForm({ name: "", unit: "each", unitCost: "", category: "", sku: "" });
        showToast("Item added");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Edit Item ──
  const startEdit = (item: MaterialItem) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      unit: item.unit,
      unitCost: String(item.unitCost),
      category: item.category || "",
      sku: item.sku || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/pricelist/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          unit: editForm.unit,
          unitCost: parseFloat(editForm.unitCost) || 0,
          category: editForm.category || null,
          sku: editForm.sku || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) =>
          prev.map((i) => (i.id === editingId ? { ...i, ...updated } : i))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditingId(null);
        showToast("Item updated");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Item ──
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/pricelist/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setDeleteConfirm(null);
        showToast("Item deleted");
      }
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  // ── Download Template ──
  const handleDownload = () => {
    window.open(`/api/suppliers/${supplier.id}/pricelist/template`, "_blank");
  };

  // ── Upload ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/suppliers/${supplier.id}/pricelist/upload`, {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (res.ok) {
        showToast(`Imported ${result.imported} items (${result.created} new, ${result.updated} updated)`);
        // Refresh pricelist
        const listRes = await fetch(`/api/suppliers/${supplier.id}/pricelist`);
        if (listRes.ok) {
          setItems(await listRes.json());
        }
      } else {
        showToast(result.error || "Upload failed", "error");
      }
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{supplier.name}</h1>
            {supplier.type && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {supplier.type}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {supplier.contactName && (
              <span className="flex items-center gap-1"><User className="size-3" /> {supplier.contactName}</span>
            )}
            {supplier.contactEmail && (
              <span className="hidden items-center gap-1 sm:flex"><Mail className="size-3" /> {supplier.contactEmail}</span>
            )}
            {supplier.contactNumber && (
              <span className="hidden items-center gap-1 sm:flex"><Phone className="size-3" /> {supplier.contactNumber}</span>
            )}
            {supplier.accountNumber && (
              <span className="hidden items-center gap-1 sm:flex"><Hash className="size-3" /> {supplier.accountNumber}</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditSupplierOpen(true)}>
          <Pencil className="mr-1 size-3" /> Edit
        </Button>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-lg border bg-white px-4 py-2">
          <span className="text-muted-foreground">Pricelist items: </span>
          <span className="font-semibold">{items.length}</span>
        </div>
        <div className="rounded-lg border bg-white px-4 py-2">
          <span className="text-muted-foreground">Total orders: </span>
          <span className="font-semibold">{supplier._count.orders}</span>
        </div>
        <div className="rounded-lg border bg-white px-4 py-2">
          <span className="text-muted-foreground">Delivered: </span>
          <span className="font-semibold">{supplier.performance.totalDelivered}</span>
        </div>
        {supplier.performance.onTimeRate !== null && (
          <div className={`rounded-lg border px-4 py-2 ${
            supplier.performance.onTimeRate >= 90 ? "border-green-200 bg-green-50" :
            supplier.performance.onTimeRate >= 70 ? "border-amber-200 bg-amber-50" :
            "border-red-200 bg-red-50"
          }`}>
            <span className="text-muted-foreground">On-time: </span>
            <span className={`font-semibold ${
              supplier.performance.onTimeRate >= 90 ? "text-green-700" :
              supplier.performance.onTimeRate >= 70 ? "text-amber-700" :
              "text-red-700"
            }`}>{supplier.performance.onTimeRate}%</span>
          </div>
        )}
        {supplier.performance.avgDaysDelta !== null && (
          <div className={`rounded-lg border px-4 py-2 ${
            supplier.performance.avgDaysDelta <= 0 ? "border-green-200 bg-green-50" :
            supplier.performance.avgDaysDelta <= 3 ? "border-amber-200 bg-amber-50" :
            "border-red-200 bg-red-50"
          }`}>
            <span className="text-muted-foreground">Avg delivery: </span>
            <span className={`font-semibold ${
              supplier.performance.avgDaysDelta <= 0 ? "text-green-700" :
              supplier.performance.avgDaysDelta <= 3 ? "text-amber-700" :
              "text-red-700"
            }`}>
              {supplier.performance.avgDaysDelta === 0
                ? "On time"
                : supplier.performance.avgDaysDelta > 0
                  ? `${supplier.performance.avgDaysDelta}d late`
                  : `${Math.abs(supplier.performance.avgDaysDelta)}d early`}
            </span>
          </div>
        )}
      </div>

      {/* Pricelist Section */}
      <div className="rounded-xl border bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search pricelist..."
              className="h-8 pl-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" className="hidden h-8 sm:inline-flex" onClick={handleDownload}>
            <Download className="mr-1 size-3.5" /> Download Template
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="hidden h-8 sm:inline-flex"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Upload className="mr-1 size-3.5" />}
            Upload Pricelist
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleUpload}
          />
          <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 size-3.5" /> Add Item
          </Button>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="mb-2 size-8 opacity-30" />
            <p className="text-sm">
              {search ? "No items match your search" : "No pricelist items yet"}
            </p>
            <p className="text-xs mt-1">
              Add items manually or upload an Excel template
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-[11px] font-medium text-muted-foreground">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 w-20">Unit</th>
                  <th className="px-3 py-2 w-28 text-right">Unit Cost</th>
                  <th className="px-3 py-2 w-32">Category</th>
                  <th className="hidden px-3 py-2 w-28 sm:table-cell">SKU</th>
                  <th className="px-3 py-2 w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) =>
                  editingId === item.id ? (
                    <tr key={item.id} className="border-b bg-blue-50/50">
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-sm"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-sm"
                          value={editForm.unit}
                          onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-7 text-sm text-right"
                          value={editForm.unitCost}
                          onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-sm"
                          value={editForm.category}
                          onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                        />
                      </td>
                      <td className="hidden px-2 py-1.5 sm:table-cell">
                        <Input
                          className="h-7 text-sm"
                          value={editForm.sku}
                          onChange={(e) => setEditForm((f) => ({ ...f, sku: e.target.value }))}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded p-1 text-green-600 hover:bg-green-50"
                            onClick={handleSaveEdit}
                            disabled={saving}
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-muted-foreground hover:bg-slate-100"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unitCost)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.category || "—"}</td>
                      <td className="hidden px-3 py-2 text-muted-foreground text-xs sm:table-cell">{item.sku || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                            onClick={() => startEdit(item)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            onClick={() => setDeleteConfirm(item.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer with count */}
        {items.length > 0 && (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            {filtered.length === items.length
              ? `${items.length} item${items.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${items.length} items`}
          </div>
        )}
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Pricelist Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Name *</label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Material name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Unit</label>
                <Input
                  value={addForm.unit}
                  onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="each, m, kg, etc."
                />
              </div>
              <div>
                <label className="text-xs font-medium">Unit Cost</label>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.unitCost}
                  onChange={(e) => setAddForm((f) => ({ ...f, unitCost: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Category</label>
                <Input
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Fixings, Timber"
                  list="categories"
                />
                {categories.length > 0 && (
                  <datalist id="categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label className="text-xs font-medium">SKU</label>
                <Input
                  value={addForm.sku}
                  onChange={(e) => setAddForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!addForm.name.trim() || saving} onClick={handleAddItem}>
                {saving ? "Adding..." : "Add Item"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove &ldquo;{items.find((i) => i.id === deleteConfirm)?.name}&rdquo; from the pricelist?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Name *</label>
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Contact Name</label>
                <Input
                  value={supplierForm.contactName}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Type</label>
                <Input
                  value={supplierForm.type}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, type: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Email</label>
                <Input
                  type="email"
                  value={supplierForm.contactEmail}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, contactEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Phone</label>
                <Input
                  value={supplierForm.contactNumber}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, contactNumber: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Account Number</label>
              <Input
                value={supplierForm.accountNumber}
                onChange={(e) => setSupplierForm((f) => ({ ...f, accountNumber: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditSupplierOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!supplierForm.name.trim() || saving} onClick={handleUpdateSupplier}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === "error" ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
