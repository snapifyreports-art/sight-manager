"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useSearchParams } from "next/navigation";
import { format, isBefore } from "date-fns";
import { OrderDetailSheet } from "./OrderDetailSheet";
import { getCurrentDate } from "@/lib/dev-date";
import {
  ShoppingCart,
  Package,
  Truck,
  AlertTriangle,
  Plus,
  MoreHorizontal,
  ClipboardCheck,
  PackageCheck,
  XCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { OrderStatusBadge, ORDER_STATUS_CONFIG } from "@/components/shared/StatusBadge";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { useConfirmAction } from "@/hooks/useConfirmAction";

// ---------- Types ----------

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
}

interface Site {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  postcode: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
}

interface Plot {
  id: string;
  name: string;
  description: string | null;
  siteId: string;
  createdAt: string;
  updatedAt: string;
  site: Site;
}

interface Job {
  id: string;
  name: string;
  description: string | null;
  plotId: string;
  location: string | null;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  plot: Plot;
}

interface OrderItem {
  id: string;
  orderId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  createdAt: string;
}

interface Order {
  id: string;
  supplierId: string;
  jobId: string;
  contactId: string | null;
  orderDetails: string | null;
  dateOfOrder: string;
  orderType: string | null;
  automated: boolean;
  status: string;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  leadTimeDays: number | null;
  itemsDescription: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: Supplier;
  job: Job;
  orderItems: OrderItem[];
}

type OrderStatus = "PENDING" | "ORDERED" | "DELIVERED" | "CANCELLED";

interface OrdersClientProps {
  initialOrders: Order[];
  suppliers: Supplier[];
  jobs: Job[];
}

// ---------- Constants ----------

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "ORDERED",
  "DELIVERED",
  "CANCELLED",
];

// ---------- Helpers ----------

function isOverdue(order: Order): boolean {
  if (order.status === "DELIVERED" || order.status === "CANCELLED") return false;
  if (!order.expectedDeliveryDate) return false;
  return isBefore(new Date(order.expectedDeliveryDate), getCurrentDate());
}

// ---------- Status Badge (with optional click-to-filter affordance) ----------

function ClickableStatusBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  if (!ORDER_STATUS_CONFIG[status]) return <Badge variant="outline">{status}</Badge>;
  if (!onClick) return <OrderStatusBadge status={status} />;
  return (
    <span
      role="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="cursor-pointer transition-shadow hover:ring-2 hover:ring-offset-1 hover:ring-current/20"
    >
      <OrderStatusBadge status={status} />
    </span>
  );
}

// ---------- Order Form ----------

interface OrderFormData {
  supplierId: string;
  jobId: string;
  contactId: string;
  orderDetails: string;
  orderType: string;
  expectedDeliveryDate: string;
  leadTimeDays: string;
  itemsDescription: string;
}

const EMPTY_FORM: OrderFormData = {
  supplierId: "",
  jobId: "",
  contactId: "",
  orderDetails: "",
  orderType: "",
  expectedDeliveryDate: "",
  leadTimeDays: "",
  itemsDescription: "",
};

function OrderFormFields({
  form,
  setForm,
  suppliers,
  jobs,
}: {
  form: OrderFormData;
  setForm: React.Dispatch<React.SetStateAction<OrderFormData>>;
  suppliers: Supplier[];
  jobs: Job[];
}) {
  return (
    <div className="grid gap-4 py-2">
      {/* Supplier */}
      <div className="grid gap-2">
        <Label htmlFor="supplier">Supplier *</Label>
        <Select
          value={form.supplierId}
          onValueChange={(val) => {
            if (val !== null) setForm((prev) => ({ ...prev, supplierId: val as string }));
          }}
        >
          <SelectTrigger className="w-full">
            <span className="flex flex-1 truncate text-left" data-slot="select-value">
              {form.supplierId
                ? (suppliers.find((s) => s.id === form.supplierId)?.name ?? "Select supplier")
                : <span className="text-muted-foreground">Select supplier</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Job */}
      <div className="grid gap-2">
        <Label htmlFor="job">Job *</Label>
        <Select
          value={form.jobId}
          onValueChange={(val) => {
            if (val !== null) setForm((prev) => ({ ...prev, jobId: val as string }));
          }}
        >
          <SelectTrigger className="w-full">
            <span className="flex flex-1 truncate text-left" data-slot="select-value">
              {form.jobId
                ? ((() => { const j = jobs.find((j) => j.id === form.jobId); return j ? `${j.name} — ${j.plot.site.name} > ${j.plot.name}` : "Select job"; })())
                : <span className="text-muted-foreground">Select job</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.name} &mdash; {j.plot.site.name} &gt; {j.plot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Order Details */}
      <div className="grid gap-2">
        <Label htmlFor="orderDetails">Order Details</Label>
        <Textarea
          id="orderDetails"
          placeholder="Describe the order..."
          value={form.orderDetails}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, orderDetails: e.target.value }))
          }
        />
      </div>

      {/* Order Type */}
      <div className="grid gap-2">
        <Label htmlFor="orderType">Order Type</Label>
        <Input
          id="orderType"
          placeholder="e.g. Bricks, Timber, Electrical"
          value={form.orderType}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, orderType: e.target.value }))
          }
        />
      </div>

      {/* Expected Delivery + Lead Time */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="expectedDeliveryDate">Expected Delivery</Label>
          <Input
            id="expectedDeliveryDate"
            type="date"
            value={form.expectedDeliveryDate}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                expectedDeliveryDate: e.target.value,
              }))
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="leadTimeDays">Lead Time (days)</Label>
          <Input
            id="leadTimeDays"
            type="number"
            min="0"
            placeholder="e.g. 14"
            value={form.leadTimeDays}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, leadTimeDays: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Items Description */}
      <div className="grid gap-2">
        <Label htmlFor="itemsDescription">Items Description</Label>
        <Textarea
          id="itemsDescription"
          placeholder="List materials / items..."
          value={form.itemsDescription}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, itemsDescription: e.target.value }))
          }
        />
      </div>
    </div>
  );
}

// ---------- Create Dialog ----------

function CreateOrderDialog({
  suppliers,
  jobs,
  onCreated,
}: {
  suppliers: Supplier[];
  jobs: Job[];
  onCreated: (order: Order) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OrderFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleCreate() {
    if (!form.supplierId || !form.jobId) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const order = await res.json();
        onCreated(order);
        setForm(EMPTY_FORM);
        setOpen(false);
      } else {
        // Was previously a silent failure — button just re-enabled with no
        // feedback, user clicks again and risks duplicates. Surface the
        // error and leave form values intact so they can adjust + retry.
        toast.error(await fetchErrorMessage(res, "Failed to create order"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            New Order
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>
        <OrderFormFields
          form={form}
          setForm={setForm}
          suppliers={suppliers}
          jobs={jobs}
        />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={handleCreate}
            disabled={submitting || !form.supplierId || !form.jobId}
          >
            {submitting ? "Creating..." : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Inline Editor Types ----------

interface EditableItem {
  id: string | null; // null = new item
  name: string;
  quantity: string;
  unit: string;
  unitCost: string;
  _deleted?: boolean;
}

function itemsFromOrder(order: Order): EditableItem[] {
  return order.orderItems.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity.toString(),
    unit: item.unit,
    unitCost: item.unitCost.toString(),
  }));
}

function calcItemTotal(item: EditableItem): number {
  const qty = parseFloat(item.quantity) || 0;
  const cost = parseFloat(item.unitCost) || 0;
  return qty * cost;
}

// ---------- Inline Order Editor ----------

function InlineOrderEditor({
  order,
  suppliers,
  onSaved,
  onCancel,
}: {
  order: Order;
  suppliers: Supplier[];
  onSaved: (updated: Order) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState(order.supplierId);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    order.expectedDeliveryDate ? order.expectedDeliveryDate.split("T")[0] : ""
  );
  const [items, setItems] = useState<EditableItem[]>(itemsFromOrder(order));
  const [saving, setSaving] = useState(false);

  const visibleItems = items.filter((i) => !i._deleted);

  const grandTotal = visibleItems.reduce(
    (sum, item) => sum + calcItemTotal(item),
    0
  );

  function updateItem(index: number, field: keyof EditableItem, value: string) {
    setItems((prev) => {
      const next = [...prev];
      const visIdx = visibleIndexToRealIndex(index);
      next[visIdx] = { ...next[visIdx], [field]: value };
      return next;
    });
  }

  function visibleIndexToRealIndex(visIndex: number): number {
    let count = -1;
    for (let i = 0; i < items.length; i++) {
      if (!items[i]._deleted) count++;
      if (count === visIndex) return i;
    }
    return -1;
  }

  function removeItem(visIndex: number) {
    setItems((prev) => {
      const next = [...prev];
      const realIdx = visibleIndexToRealIndex(visIndex);
      if (next[realIdx].id) {
        // Existing item: mark deleted
        next[realIdx] = { ...next[realIdx], _deleted: true };
      } else {
        // New item: just remove
        next.splice(realIdx, 1);
      }
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: null, name: "", quantity: "1", unit: "units", unitCost: "0" },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Update order-level fields
      const orderRes = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          expectedDeliveryDate: expectedDeliveryDate || null,
        }),
      });
      if (!orderRes.ok) {
        toast.error(await fetchErrorMessage(orderRes, "Failed to update order"));
        return;
      }

      // 2. Process item changes
      let itemFailures = 0;
      for (const item of items) {
        if (item._deleted && item.id) {
          // Delete existing item
          const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            toast.error(await fetchErrorMessage(res, `Failed to delete item "${item.name}"`));
            itemFailures++;
          }
        } else if (!item._deleted && item.id) {
          // Update existing item
          const res = await fetch(`/api/orders/${order.id}/items/${item.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unitCost: item.unitCost,
            }),
          });
          if (!res.ok) {
            toast.error(await fetchErrorMessage(res, `Failed to update item "${item.name}"`));
            itemFailures++;
          }
        } else if (!item._deleted && !item.id && item.name.trim()) {
          // Create new item
          const res = await fetch(`/api/orders/${order.id}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unitCost: item.unitCost,
            }),
          });
          if (!res.ok) {
            toast.error(await fetchErrorMessage(res, `Failed to add item "${item.name}"`));
            itemFailures++;
          }
        }
      }

      // 3. Refetch the full order
      const freshRes = await fetch(`/api/orders/${order.id}`);
      if (!freshRes.ok) {
        toast.error(await fetchErrorMessage(freshRes, "Order saved but failed to refresh"));
        return;
      }
      const freshOrder = await freshRes.json();
      onSaved(freshOrder);
      if (itemFailures === 0) {
        // Success — caller closes editor; nothing more to do
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td colSpan={8} className="p-0">
        <div className="border-y border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-4 space-y-4">
          {/* Order-level fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium">Supplier</Label>
              <Select
                value={supplierId}
                onValueChange={(val) => {
                  if (val !== null) setSupplierId(val as string);
                }}
              >
                <SelectTrigger className="h-9 bg-white dark:bg-background">
                  <span className="flex flex-1 truncate text-left" data-slot="select-value">
                    {suppliers.find((s) => s.id === supplierId)?.name ?? "Select supplier"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium">Expected Delivery</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="h-9 bg-white dark:bg-background"
              />
            </div>
          </div>

          {/* Items table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                Items ({visibleItems.length})
                {grandTotal > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    &middot; Total: &pound;{grandTotal.toFixed(2)}
                  </span>
                )}
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={addItem}
              >
                <Plus className="size-3" /> Add Item
              </Button>
            </div>

            {visibleItems.length > 0 && (
              <div className="rounded-md border bg-white dark:bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs w-20">Qty</TableHead>
                      <TableHead className="text-xs w-24">Unit</TableHead>
                      <TableHead className="text-xs w-28">Unit Cost</TableHead>
                      <TableHead className="text-xs w-24 text-right">Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleItems.map((item, idx) => (
                      <TableRow key={item.id ?? `new-${idx}`}>
                        <TableCell className="p-1.5">
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(idx, "name", e.target.value)}
                            placeholder="Item name"
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="h-8 text-sm"
                            min="0"
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            value={item.unit}
                            onChange={(e) => updateItem(idx, "unit", e.target.value)}
                            placeholder="units"
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Input
                            type="number"
                            value={item.unitCost}
                            onChange={(e) => updateItem(idx, "unitCost", e.target.value)}
                            step="0.01"
                            min="0"
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="p-1.5 text-right text-sm font-medium">
                          &pound;{calcItemTotal(item).toFixed(2)}
                        </TableCell>
                        <TableCell className="p-1.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeItem(idx)}
                            className="text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {visibleItems.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                No items. Click &quot;Add Item&quot; to add one.
              </p>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center justify-end gap-2 border-t border-blue-200 dark:border-blue-900 pt-3">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------- Main Component ----------

export function OrdersClient({
  initialOrders,
  suppliers,
  jobs,
}: OrdersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>(initialOrders);

  // Auto-refresh when user navigates back or tab regains focus
  const refreshOrders = useCallback(() => { router.refresh(); }, [router]);
  useRefreshOnFocus(refreshOrders);

  // Sync orders when server re-renders
  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);

  const initialStatus = searchParams.get("status") ?? "ALL";
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatus === "OVERDUE" || ALL_STATUSES.includes(initialStatus as OrderStatus) ? initialStatus : "ALL"
  );
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");
  const [plotFilter, setPlotFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  // (May 2026 audit #109) Search across order details / supplier name /
  // plot name / item names. Free-text search complements the chip
  // filters above — managers asking "did we order the plumbing for
  // plot 14 yet?" need to type, not click through 40 orders.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Update URL when status filter changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (statusFilter === "ALL") {
      params.delete("status");
    } else {
      params.set("status", statusFilter);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [statusFilter, searchParams]);

  // Auto-open order from URL param ?orderId=XXX
  useEffect(() => {
    const orderId = searchParams.get("orderId");
    if (orderId && !selectedOrder) {
      const order = orders.find((o) => o.id === orderId);
      if (order) setSelectedOrder(order);
    }
  }, [searchParams, orders, selectedOrder]);

  const siteFilter = searchParams.get("site") ?? "";

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter === "OVERDUE") {
        if (!isOverdue(order)) return false;
      } else if (statusFilter !== "ALL" && order.status !== statusFilter) {
        return false;
      }
      if (supplierFilter !== "ALL" && order.supplierId !== supplierFilter) return false;
      if (plotFilter !== "ALL" && order.job.plotId !== plotFilter) return false;
      if (siteFilter && order.job.plot.siteId !== siteFilter) return false;
      if (dateFrom && order.expectedDeliveryDate && order.expectedDeliveryDate.split("T")[0] < dateFrom) return false;
      if (dateFrom && !order.expectedDeliveryDate) return false;
      if (dateTo && order.expectedDeliveryDate && order.expectedDeliveryDate.split("T")[0] > dateTo) return false;
      if (dateTo && !order.expectedDeliveryDate) return false;
      // (May 2026 audit #109) Free-text search across the fields a
      // manager would naturally type: order details, supplier name,
      // plot name, plot number, site name, job name, item names.
      if (q) {
        const haystack = [
          order.orderDetails ?? "",
          order.itemsDescription ?? "",
          order.supplier?.name ?? "",
          order.job?.name ?? "",
          order.job?.plot?.name ?? "",
          order.job?.plot?.site?.name ?? "",
          ...(order.orderItems?.map((i) => i.name) ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, supplierFilter, plotFilter, siteFilter, dateFrom, dateTo, searchQuery]);

  // Build plot options dynamically from order data
  const plotOptions = useMemo(() => {
    const plotMap = new Map<string, string>();
    orders.forEach((o) => {
      if (!plotMap.has(o.job.plotId)) {
        plotMap.set(o.job.plotId, `${o.job.plot.site.name} > ${o.job.plot.name}`);
      }
    });
    return Array.from(plotMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({ id, label }));
  }, [orders]);

  // Stats
  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === "PENDING").length;
    const ordered = orders.filter((o) => o.status === "ORDERED").length;
    const delivered = orders.filter((o) => o.status === "DELIVERED").length;
    const overdue = orders.filter(isOverdue).length;
    return { pending, ordered, delivered, overdue };
  }, [orders]);

  function handleCreated(order: Order) {
    setOrders((prev) => [order, ...prev]);
  }

  function handleUpdated(updated: Order) {
    setOrders((prev) =>
      prev.map((o) => (o.id === updated.id ? updated : o))
    );
    if (selectedOrder?.id === updated.id) {
      setSelectedOrder(updated);
    }
  }

  const { setOrderStatus } = useOrderStatus({
    onChange: (orderId, newStatus) => {
      const now = new Date().toISOString();
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const next = { ...o, status: newStatus };
          if (newStatus === "ORDERED") next.dateOfOrder = now;
          if (newStatus === "DELIVERED") next.deliveredDate = now;
          return next;
        })
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => {
          if (!prev) return prev;
          const next = { ...prev, status: newStatus };
          if (newStatus === "ORDERED") next.dateOfOrder = now;
          if (newStatus === "DELIVERED") next.deliveredDate = now;
          return next;
        });
      }
    },
  });

  function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    void setOrderStatus(orderId, newStatus);
  }

  // Confirm-delete flow shared via useConfirmAction.
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  function handleDelete(order: Order) {
    confirmAction({
      title: "Delete Order",
      description: (
        <>
          Are you sure you want to delete the{" "}
          <span className="font-medium text-foreground">{order.supplier.name}</span>{" "}
          order for{" "}
          <span className="font-medium text-foreground">{order.job.plot.name} — {order.job.name}</span>?
          This cannot be undone.
        </>
      ),
      confirmLabel: "Delete Order",
      onConfirm: async () => {
        const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(await fetchErrorMessage(res, "Failed to delete order"));
        }
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        toast.success("Order deleted");
      },
    });
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Orders" },
      ]} />
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Order Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage material orders for your jobs
          </p>
        </div>
        <CreateOrderDialog
          suppliers={suppliers}
          jobs={jobs}
          onCreated={handleCreated}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          className={`cursor-pointer transition-shadow hover:ring-2 hover:ring-yellow-400/50${statusFilter === "PENDING" ? " ring-2 ring-yellow-500" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "PENDING" ? "ALL" : "PENDING")}
        >
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-yellow-500/10 p-2">
              <ShoppingCart className="size-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-shadow hover:ring-2 hover:ring-blue-400/50${statusFilter === "ORDERED" ? " ring-2 ring-blue-500" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "ORDERED" ? "ALL" : "ORDERED")}
        >
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Package className="size-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.ordered}</p>
              <p className="text-xs text-muted-foreground">Ordered</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-shadow hover:ring-2 hover:ring-green-400/50${statusFilter === "DELIVERED" ? " ring-2 ring-green-500" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "DELIVERED" ? "ALL" : "DELIVERED")}
        >
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Truck className="size-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.delivered}</p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-shadow hover:ring-2 hover:ring-red-400/50${statusFilter === "OVERDUE" ? " ring-2 ring-red-500" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "OVERDUE" ? "ALL" : "OVERDUE")}
        >
          <CardContent className="flex items-center gap-3 pt-4">
            <div className="rounded-lg bg-red-500/10 p-2">
              <AlertTriangle className="size-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.overdue}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "ALL", label: "All", count: orders.length },
          { key: "PENDING", label: "Pending", count: stats.pending },
          { key: "ORDERED", label: "Ordered", count: stats.ordered },
          { key: "DELIVERED", label: "Delivered", count: stats.delivered },
          { key: "OVERDUE", label: "Overdue", count: stats.overdue },
          { key: "CANCELLED", label: "Cancelled", count: orders.filter((o) => o.status === "CANCELLED").length },
        ].map((pill) => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              statusFilter === pill.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {pill.label} ({pill.count})
          </button>
        ))}
      </div>

      {/* Additional Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Plot</label>
          <select
            value={plotFilter}
            onChange={(e) => setPlotFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Plots</option>
            {plotOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Supplier</label>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Delivery From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-auto"
          />
        </div>

        <div className="grid gap-1">
          <label className="text-xs font-medium text-muted-foreground">Delivery To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-auto"
          />
        </div>

        {/* (May 2026 audit #109) Free-text search across orders. */}
        <div className="grid gap-1 flex-1 min-w-[200px]">
          <label htmlFor="orders-search-input" className="text-xs font-medium text-muted-foreground">Search</label>
          <Input
            id="orders-search-input"
            type="search"
            placeholder="Item, supplier, plot…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9"
          />
        </div>

        {(statusFilter !== "ALL" || supplierFilter !== "ALL" || plotFilter !== "ALL" || dateFrom || dateTo || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setStatusFilter("ALL");
              setSupplierFilter("ALL");
              setPlotFilter("ALL");
              setDateFrom("");
              setDateTo("");
              setSearchQuery("");
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground">
          {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                No orders found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {orders.length === 0
                  ? "Create your first order to get started."
                  : "Try adjusting your filters."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Details</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead className="hidden md:table-cell">Expected Delivery</TableHead>
                  <TableHead className="hidden md:table-cell">Lead Time</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const overdue = isOverdue(order);

                  // Inline editor row
                  if (editingOrderId === order.id) {
                    return (
                      <InlineOrderEditor
                        key={`edit-${order.id}`}
                        order={order}
                        suppliers={suppliers}
                        onSaved={(updated) => {
                          handleUpdated(updated);
                          setEditingOrderId(null);
                        }}
                        onCancel={() => setEditingOrderId(null)}
                      />
                    );
                  }

                  return (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedOrder(order)}>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="truncate font-medium">
                            {order.orderDetails || order.orderType || order.itemsDescription || "Untitled Order"}
                          </p>
                          {order.itemsDescription && order.orderDetails !== order.itemsDescription && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {order.itemsDescription}
                            </p>
                          )}
                          {order.orderItems.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {order.orderItems.length} item{order.orderItems.length !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Link href={`/suppliers/${order.supplier.id}`} className="font-medium text-blue-600 hover:underline">
                          {order.supplier.name}
                        </Link>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div>
                          <Link href={`/jobs/${order.job.id}`} className="text-sm text-blue-600 hover:underline">
                            {order.job.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            <Link href={`/sites/${order.job.plot.siteId}`} className="hover:underline hover:text-blue-600">
                              {order.job.plot.site.name}
                            </Link>
                            {" > "}
                            <Link href={`/sites/${order.job.plot.siteId}/plots/${order.job.plot.id}`} className="hover:underline hover:text-blue-600">
                              {order.job.plot.name}
                            </Link>
                          </p>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <ClickableStatusBadge status={order.status} onClick={() => setStatusFilter(order.status)} />
                          {overdue && (
                            <AlertTriangle className="size-3.5 text-red-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.dateOfOrder), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {order.expectedDeliveryDate ? (
                          <span
                            className={
                              overdue
                                ? "font-medium text-red-600 dark:text-red-400"
                                : ""
                            }
                          >
                            {format(
                              new Date(order.expectedDeliveryDate),
                              "dd MMM yyyy"
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                        {order.deliveredDate && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Delivered{" "}
                            {format(
                              new Date(order.deliveredDate),
                              "dd MMM yyyy"
                            )}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {order.leadTimeDays != null ? (
                          <span>{order.leadTimeDays} days</span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-xs">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {order.status !== "ORDERED" &&
                              order.status !== "DELIVERED" &&
                              order.status !== "CANCELLED" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(order.id, "ORDERED")
                                  }
                                >
                                  <Package className="size-4" />
                                  Mark as Ordered
                                </DropdownMenuItem>
                              )}
                            {order.status !== "DELIVERED" &&
                              order.status !== "CANCELLED" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(order.id, "DELIVERED")
                                  }
                                >
                                  <PackageCheck className="size-4" />
                                  Mark as Delivered
                                </DropdownMenuItem>
                              )}
                            {order.status !== "CANCELLED" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(order.id, "CANCELLED")
                                }
                              >
                                <XCircle className="size-4" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setEditingOrderId(order.id)}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(order)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}
        onUpdated={handleUpdated}
        onDeleted={(orderId) => {
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
          setSelectedOrder(null);
        }}
        onEditClick={(order) => {
          setEditingOrderId(order.id);
          setSelectedOrder(null);
        }}
      />

      {/* Shared confirm-delete dialog (useConfirmAction) */}
      {confirmDialogs}

    </div>
  );
}
