"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isBefore } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import {
  Package,
  ClipboardCheck,
  PackageCheck,
  XCircle,
  Pencil,
  Trash2,
  Plus,
  ExternalLink,
  CalendarDays,
  Truck,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ---------- Types (mirrors OrdersClient) ----------

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

type OrderStatus = "PENDING" | "ORDERED" | "CONFIRMED" | "DELIVERED" | "CANCELLED";

// ---------- Status helpers ----------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-yellow-500/15 text-yellow-700" },
  ORDERED: { label: "Ordered", className: "bg-blue-500/15 text-blue-700" },
  CONFIRMED: { label: "Confirmed", className: "bg-purple-500/15 text-purple-700" },
  DELIVERED: { label: "Delivered", className: "bg-green-500/15 text-green-700" },
  CANCELLED: { label: "Cancelled", className: "bg-red-500/15 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: "" };
  return <Badge className={config.className}>{config.label}</Badge>;
}

// ---------- Component ----------

interface OrderDetailSheetProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (order: Order) => void;
  onDeleted: (orderId: string) => void;
  onEditClick: (order: Order) => void;
}

export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
  onEditClick,
}: OrderDetailSheetProps) {
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemUnit, setNewItemUnit] = useState("units");
  const [newItemCost, setNewItemCost] = useState("");

  // Sync items when order changes
  const orderItems = order?.orderItems ?? [];

  const isOverdue = order
    ? order.status !== "DELIVERED" &&
      order.status !== "CANCELLED" &&
      order.expectedDeliveryDate &&
      isBefore(new Date(order.expectedDeliveryDate), getCurrentDate())
    : false;

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return;
    setStatusLoading(newStatus);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated(updated);
      }
    } finally {
      setStatusLoading(null);
    }
  }

  async function handleDelete() {
    if (!order || !confirm("Delete this order?")) return;
    const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(order.id);
      onOpenChange(false);
    }
  }

  async function handleAddItem() {
    if (!order || !newItemName.trim()) return;
    const res = await fetch(`/api/orders/${order.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newItemName.trim(),
        quantity: newItemQty,
        unit: newItemUnit,
        unitCost: newItemCost || "0",
      }),
    });
    if (res.ok) {
      // Refetch the full order to get updated items
      const orderRes = await fetch(`/api/orders/${order.id}`);
      if (orderRes.ok) {
        const updated = await orderRes.json();
        onUpdated(updated);
      }
      setNewItemName("");
      setNewItemQty("1");
      setNewItemUnit("units");
      setNewItemCost("");
      setAddingItem(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!order) return;
    const res = await fetch(`/api/orders/${order.id}/items/${itemId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const orderRes = await fetch(`/api/orders/${order.id}`);
      if (orderRes.ok) {
        const updated = await orderRes.json();
        onUpdated(updated);
      }
    }
  }

  if (!order) return null;

  const statusActions: Array<{ status: OrderStatus; label: string; icon: React.ReactNode }> = [];
  if (order.status !== "ORDERED" && order.status !== "DELIVERED" && order.status !== "CANCELLED") {
    statusActions.push({ status: "ORDERED", label: "Mark as Ordered", icon: <Package className="size-3.5" /> });
  }
  if (order.status !== "CONFIRMED" && order.status !== "DELIVERED" && order.status !== "CANCELLED") {
    statusActions.push({ status: "CONFIRMED", label: "Mark as Confirmed", icon: <ClipboardCheck className="size-3.5" /> });
  }
  if (order.status !== "DELIVERED" && order.status !== "CANCELLED") {
    statusActions.push({ status: "DELIVERED", label: "Mark as Delivered", icon: <PackageCheck className="size-3.5" /> });
  }
  if (order.status !== "CANCELLED") {
    statusActions.push({ status: "CANCELLED", label: "Cancel Order", icon: <XCircle className="size-3.5" /> });
  }

  const totalValue = orderItems.reduce((sum, item) => sum + item.totalCost, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            {isOverdue && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="size-3" /> Overdue
              </span>
            )}
            {order.automated && (
              <Badge variant="outline" className="text-[10px]">Auto</Badge>
            )}
          </div>
          <SheetTitle>{order.orderDetails || "Order"}</SheetTitle>
          <SheetDescription>
            {order.orderType && <span>{order.orderType} · </span>}
            {order.itemsDescription || "No description"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {/* Links */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Supplier</span>
              <Link href={`/suppliers/${order.supplier.id}`} className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                {order.supplier.name} <ExternalLink className="size-3" />
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Job</span>
              <Link href={`/jobs/${order.job.id}`} className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                {order.job.name} <ExternalLink className="size-3" />
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Location</span>
              <Link
                href={`/sites/${order.job.plot.siteId}/plots/${order.job.plot.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                {order.job.plot.site.name} &gt; {order.job.plot.name}
              </Link>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarDays className="size-3" /> Order Date
              </span>
              <span className="text-sm">{format(new Date(order.dateOfOrder), "dd MMM yyyy")}</span>
            </div>
            {order.expectedDeliveryDate && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Truck className="size-3" /> Expected Delivery
                </span>
                <span className={`text-sm ${isOverdue ? "font-medium text-red-600" : ""}`}>
                  {format(new Date(order.expectedDeliveryDate), "dd MMM yyyy")}
                </span>
              </div>
            )}
            {order.deliveredDate && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <PackageCheck className="size-3" /> Delivered
                </span>
                <span className="text-sm text-green-600">
                  {format(new Date(order.deliveredDate), "dd MMM yyyy")}
                </span>
              </div>
            )}
            {order.leadTimeDays != null && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Lead Time</span>
                <span className="text-sm">{order.leadTimeDays} days</span>
              </div>
            )}
          </div>

          {/* Status Actions */}
          {statusActions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Actions</p>
              <div className="flex flex-wrap gap-1.5">
                {statusActions.map((action) => (
                  <Button
                    key={action.status}
                    variant={action.status === "CANCELLED" ? "outline" : "secondary"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={statusLoading !== null}
                    onClick={() => handleStatusChange(action.status)}
                  >
                    {statusLoading === action.status ? "..." : action.icon}
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Order Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Items ({orderItems.length})
                {totalValue > 0 && (
                  <span className="ml-1 font-normal">
                    &middot; Total: &pound;{totalValue.toFixed(2)}
                  </span>
                )}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={() => setAddingItem(!addingItem)}
              >
                <Plus className="size-3" /> Add
              </Button>
            </div>

            {addingItem && (
              <div className="space-y-2 rounded border p-2">
                <Input
                  placeholder="Item name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Qty"
                    type="number"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    className="h-8 w-16 text-sm"
                  />
                  <Input
                    placeholder="Unit"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="h-8 w-20 text-sm"
                  />
                  <Input
                    placeholder="Unit cost"
                    type="number"
                    step="0.01"
                    value={newItemCost}
                    onChange={(e) => setNewItemCost(e.target.value)}
                    className="h-8 flex-1 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingItem(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddItem} disabled={!newItemName.trim()}>
                    Add Item
                  </Button>
                </div>
              </div>
            )}

            {orderItems.length > 0 ? (
              <div className="space-y-1">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{item.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.quantity} {item.unit}
                        {item.unitCost > 0 && ` @ \u00A3${item.unitCost.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.totalCost > 0 && (
                        <span className="text-xs font-medium">&pound;{item.totalCost.toFixed(2)}</span>
                      )}
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No items added yet</p>
            )}
          </div>

          {/* Edit / Delete footer */}
          <div className="flex gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => onEditClick(order)}
            >
              <Pencil className="size-3.5" /> Edit Order
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={handleDelete}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
