"use client";

import { useState, useMemo } from "react";
import { format, isPast } from "date-fns";
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

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
}

interface Job {
  id: string;
  name: string;
  description: string | null;
  workflowId: string;
  location: string | null;
  address: string | null;
  siteName: string | null;
  plot: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  workflow: Workflow;
}

interface Order {
  id: string;
  supplierId: string;
  jobId: string;
  orderDetails: string | null;
  dateOfOrder: string;
  orderType: string | null;
  automated: boolean;
  status: string;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  leadTimeDays: number | null;
  items: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: Supplier;
  job: Job;
}

type OrderStatus = "PENDING" | "ORDERED" | "CONFIRMED" | "DELIVERED" | "CANCELLED";

interface OrdersClientProps {
  initialOrders: Order[];
  suppliers: Supplier[];
  jobs: Job[];
}

// ---------- Constants ----------

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  },
  ORDERED: {
    label: "Ordered",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
};

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "ORDERED",
  "CONFIRMED",
  "DELIVERED",
  "CANCELLED",
];

// ---------- Helpers ----------

function isOverdue(order: Order): boolean {
  if (order.status === "DELIVERED" || order.status === "CANCELLED") return false;
  if (!order.expectedDeliveryDate) return false;
  return isPast(new Date(order.expectedDeliveryDate));
}

// ---------- Status Badge ----------

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as OrderStatus];
  if (!config) return <Badge variant="outline">{status}</Badge>;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ---------- Order Form ----------

interface OrderFormData {
  supplierId: string;
  jobId: string;
  orderDetails: string;
  orderType: string;
  expectedDeliveryDate: string;
  leadTimeDays: string;
  items: string;
}

const EMPTY_FORM: OrderFormData = {
  supplierId: "",
  jobId: "",
  orderDetails: "",
  orderType: "",
  expectedDeliveryDate: "",
  leadTimeDays: "",
  items: "",
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
            <SelectValue placeholder="Select supplier" />
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
            <SelectValue placeholder="Select job" />
          </SelectTrigger>
          <SelectContent>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.name}
                {j.siteName ? ` — ${j.siteName}` : ""}
                {j.plot ? ` (Plot ${j.plot})` : ""}
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

      {/* Items */}
      <div className="grid gap-2">
        <Label htmlFor="items">Items</Label>
        <Textarea
          id="items"
          placeholder="List materials / items..."
          value={form.items}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, items: e.target.value }))
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
      }
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

// ---------- Edit Dialog ----------

function EditOrderDialog({
  order,
  suppliers,
  jobs,
  onUpdated,
}: {
  order: Order;
  suppliers: Supplier[];
  jobs: Job[];
  onUpdated: (order: Order) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OrderFormData>({
    supplierId: order.supplierId,
    jobId: order.jobId,
    orderDetails: order.orderDetails || "",
    orderType: order.orderType || "",
    expectedDeliveryDate: order.expectedDeliveryDate
      ? order.expectedDeliveryDate.split("T")[0]
      : "",
    leadTimeDays: order.leadTimeDays?.toString() || "",
    items: order.items || "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleUpdate() {
    if (!form.supplierId || !form.jobId) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const updated = await res.json();
        onUpdated(updated);
        setOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground">
            <Pencil className="size-4" />
            Edit
          </button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Order</DialogTitle>
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
            onClick={handleUpdate}
            disabled={submitting || !form.supplierId || !form.jobId}
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main Component ----------

export function OrdersClient({
  initialOrders,
  suppliers,
  jobs,
}: OrdersClientProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== "ALL" && order.status !== statusFilter) return false;
      if (supplierFilter !== "ALL" && order.supplierId !== supplierFilter)
        return false;
      return true;
    });
  }, [orders, statusFilter, supplierFilter]);

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
  }

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) {
      const updated = await res.json();
      handleUpdated(updated);
    }
  }

  async function handleDelete(orderId: string) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
  }

  return (
    <div className="space-y-6">
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
        <Card>
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
        <Card>
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
        <Card>
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
        <Card>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(val) => { if (val !== null) setStatusFilter(val as string); }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={supplierFilter}
          onValueChange={(val) => { if (val !== null) setSupplierFilter(val as string); }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Filter by supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "ALL" || supplierFilter !== "ALL") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("ALL");
              setSupplierFilter("ALL");
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
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const overdue = isOverdue(order);
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="truncate font-medium">
                            {order.orderDetails || "No details"}
                          </p>
                          {order.orderType && (
                            <p className="truncate text-xs text-muted-foreground">
                              {order.orderType}
                            </p>
                          )}
                          {order.items && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {order.items}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {order.supplier.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{order.job.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.job.workflow.name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={order.status} />
                          {overdue && (
                            <AlertTriangle className="size-3.5 text-red-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.dateOfOrder), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
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
                      <TableCell>
                        {order.leadTimeDays != null ? (
                          <span>{order.leadTimeDays} days</span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
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
                            {order.status !== "CONFIRMED" &&
                              order.status !== "DELIVERED" &&
                              order.status !== "CANCELLED" && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleStatusChange(order.id, "CONFIRMED")
                                  }
                                >
                                  <ClipboardCheck className="size-4" />
                                  Mark as Confirmed
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
                            <EditOrderDialog
                              order={order}
                              suppliers={suppliers}
                              jobs={jobs}
                              onUpdated={handleUpdated}
                            />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(order.id)}
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
    </div>
  );
}
