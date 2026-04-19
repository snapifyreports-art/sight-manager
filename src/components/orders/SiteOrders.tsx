"use client";

import { useState, useEffect, useMemo } from "react";
import { format, addDays } from "date-fns";
import { buildOrderMailto } from "@/lib/order-email";
import {
  Package,
  Loader2,
  AlertTriangle,
  Truck,
  ShoppingCart,
  Check,
  CheckCircle2,
  Mail,
  Plus,
  ChevronRight,
  ChevronLeft,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { OrderStatusBadge } from "@/components/shared/StatusBadge";
import { useOrderStatus, type OrderStatus } from "@/hooks/useOrderStatus";

// ---------- Types ----------

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface SiteOrder {
  id: string;
  status: string;
  orderDetails: string | null;
  itemsDescription: string | null;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  leadTimeDays: number | null;
  automated: boolean;
  supplier: { id: string; name: string; contactEmail: string | null; contactName: string | null; accountNumber: string | null };
  job: {
    id: string;
    name: string;
    plot: { id: string; name: string; plotNumber: string | null };
  };
  orderItems: OrderItem[];
}

interface WizardJob {
  id: string;
  name: string;
  parentStage: string | null;
  startDate: string | null;
  status: string;
}

interface WizardPlot {
  id: string;
  name: string;
  plotNumber: string | null;
  houseType: string | null;
  jobs: WizardJob[];
}

interface WizardSupplier {
  id: string;
  name: string;
  contactEmail: string | null;
  contactName: string | null;
}

interface WizardOrderItem {
  id: string;
  name: string;
  qtyPerPlot: string;
  unit: string;
  unitCost: string;
}

interface SiteOrdersProps {
  siteId: string;
}

// ---------- Constants ----------

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "ORDERED", label: "Ordered" },
  { value: "DELIVERED", label: "Delivered" },
];

// ---------- Wizard step indicator ----------

function WizardSteps({ step }: { step: number }) {
  const steps = ["Plots", "Stage", "Details", "Review"];
  return (
    <div className="flex items-center gap-1.5 pb-4">
      {steps.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-blue-600 text-white"
                  : active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <Check className="size-3" /> : num}
            </div>
            <span
              className={`text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Main component ----------

export function SiteOrders({ siteId }: SiteOrdersProps) {
  const toast = useToast();
  const [orders, setOrders] = useState<SiteOrder[]>([]);
  const [siteInfo, setSiteInfo] = useState<{ name: string; address: string | null; postcode: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const { setManyOrderStatus, isPending: isStatusPending } = useOrderStatus({
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
    },
  });

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardPlots, setWizardPlots] = useState<WizardPlot[]>([]);
  const [wizardSuppliers, setWizardSuppliers] = useState<WizardSupplier[]>([]);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [selectedPlotIds, setSelectedPlotIds] = useState<Set<string>>(new Set());
  const [selectedJobName, setSelectedJobName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierMaterials, setSupplierMaterials] = useState<Array<{ name: string; unit: string; unitCost: number }>>([]);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<WizardOrderItem[]>([]);
  const [leadTimeDays, setLeadTimeDays] = useState("14");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleGroupStatus = (orderIds: string[], status: OrderStatus) => {
    void setManyOrderStatus(orderIds, status);
  };

  const refreshOrders = () => {
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/orders`);
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to refresh orders"));
          return;
        }
        const data = await res.json();
        setOrders(data.orders || data);
        if (data.site) setSiteInfo(data.site);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to refresh orders");
      }
    })();
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/orders`);
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to load orders"));
          return;
        }
        const data = await res.json();
        setOrders(data.orders || data);
        if (data.site) setSiteInfo(data.site);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load orders");
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId, toast]);

  // Load wizard data when dialog opens
  useEffect(() => {
    if (!wizardOpen) return;
    setWizardLoading(true);
    Promise.all([
      fetch(`/api/sites/${siteId}/programme`).then(async (r) => {
        if (!r.ok) throw new Error(await fetchErrorMessage(r, "Failed to load programme"));
        return r.json();
      }),
      fetch("/api/suppliers").then(async (r) => {
        if (!r.ok) throw new Error(await fetchErrorMessage(r, "Failed to load suppliers"));
        return r.json();
      }),
    ])
      .then(([programme, suppliers]) => {
        const plots: WizardPlot[] = (programme.plots ?? []).map((p: WizardPlot) => ({
          id: p.id,
          name: p.name,
          plotNumber: p.plotNumber,
          houseType: p.houseType,
          jobs: (p.jobs ?? []).map((j: WizardJob) => ({
            id: j.id,
            name: j.name,
            parentStage: j.parentStage,
            startDate: j.startDate,
            status: j.status,
          })),
        }));
        setWizardPlots(plots);
        setWizardSuppliers(Array.isArray(suppliers) ? suppliers : []);
        setSelectedPlotIds(new Set(plots.map((p) => p.id)));
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Failed to load wizard data");
      })
      .finally(() => setWizardLoading(false));
  }, [wizardOpen, siteId, toast]);

  // Reset wizard when closed
  const openWizard = () => {
    setWizardStep(1);
    setSelectedPlotIds(new Set());
    setSelectedJobName("");
    setSupplierId("");
    setSupplierMaterials([]);
    setCatalogueOpen(false);
    setOrderItems([]);
    setLeadTimeDays("14");
    setCreateError("");
    setWizardOpen(true);
  };

  const closeWizard = () => setWizardOpen(false);

  // Fetch supplier materials when a supplier is selected
  useEffect(() => {
    if (!supplierId) { setSupplierMaterials([]); setCatalogueOpen(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/suppliers/${supplierId}/materials`);
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to load supplier materials"));
          setSupplierMaterials([]);
          return;
        }
        const data = await res.json();
        setSupplierMaterials(Array.isArray(data) ? data : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load supplier materials");
        setSupplierMaterials([]);
      }
    })();
  }, [supplierId, toast]);

  // Unique job names across selected plots, grouped by parentStage
  const availableJobGroups = useMemo(() => {
    const selectedPlots = wizardPlots.filter((p) => selectedPlotIds.has(p.id));
    const nameToGroup = new Map<string, string | null>(); // jobName → parentStage

    for (const plot of selectedPlots) {
      for (const job of plot.jobs) {
        if (!nameToGroup.has(job.name)) {
          nameToGroup.set(job.name, job.parentStage);
        }
      }
    }

    // Group by parentStage
    const groups = new Map<string, string[]>(); // parentStage → [jobNames]
    for (const [name, parent] of nameToGroup) {
      const key = parent ?? "Other";
      const arr = groups.get(key) ?? [];
      arr.push(name);
      groups.set(key, arr);
    }

    // Sort groups alphabetically
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [wizardPlots, selectedPlotIds]);

  // For the selected job name, find matching jobs on selected plots
  const matchingJobs = useMemo(() => {
    if (!selectedJobName) return [];
    return wizardPlots
      .filter((p) => selectedPlotIds.has(p.id))
      .flatMap((p) =>
        p.jobs
          .filter((j) => j.name === selectedJobName)
          .map((j) => ({ plotId: p.id, plotName: p.name, plotNumber: p.plotNumber, job: j }))
      );
  }, [wizardPlots, selectedPlotIds, selectedJobName]);

  // Step 4 review computed values
  const reviewParsedItems = useMemo(
    () => orderItems.filter((i) => i.name.trim()),
    [orderItems]
  );
  const reviewPerPlotCost = useMemo(
    () => reviewParsedItems.reduce((sum, i) => sum + (parseFloat(i.qtyPerPlot) || 0) * (parseFloat(i.unitCost) || 0), 0),
    [reviewParsedItems]
  );
  const reviewTotalCost = useMemo(
    () => reviewPerPlotCost * matchingJobs.length,
    [reviewPerPlotCost, matchingJobs]
  );

  // Calculate delivery date and warnings
  const deliveryDate = useMemo(() => {
    const days = parseInt(leadTimeDays, 10);
    if (isNaN(days) || days < 1) return null;
    return addDays(new Date(), days);
  }, [leadTimeDays]);

  const deliveryWarnings = useMemo(() => {
    if (!deliveryDate) return [];
    return matchingJobs.filter((m) => {
      if (!m.job.startDate) return false;
      return new Date(m.job.startDate) < deliveryDate;
    });
  }, [matchingJobs, deliveryDate]);

  // Submit: create one order per matching job, each with per-plot order items
  const handleCreate = async () => {
    if (!supplierId || matchingJobs.length === 0) return;
    setCreating(true);
    setCreateError("");
    let failed = 0;
    let firstError: string | null = null;

    const parsedItems = orderItems
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        quantity: parseFloat(i.qtyPerPlot) || 1,
        unit: i.unit.trim() || "units",
        unitCost: parseFloat(i.unitCost) || 0,
      }));

    for (const { job } of matchingJobs) {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          jobId: job.id,
          leadTimeDays: parseInt(leadTimeDays, 10) || undefined,
          expectedDeliveryDate: deliveryDate?.toISOString() || undefined,
          items: parsedItems.length > 0 ? parsedItems : undefined,
        }),
      });
      if (!res.ok) {
        failed++;
        if (firstError === null) {
          firstError = await fetchErrorMessage(res, "Failed to create order");
        }
      }
    }

    setCreating(false);
    if (failed > 0) {
      const msg = `${failed} order(s) failed to create${firstError ? `: ${firstError}` : ". Please try again."}`;
      setCreateError(msg);
      toast.error(msg);
    } else {
      closeWizard();
      refreshOrders();
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filtered =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  const groupedOrders = useMemo(() => {
    const groupMap = new Map<string, SiteOrder[]>();
    for (const order of filtered) {
      const key = `${order.supplier.id}__${order.job.name}`;
      const existing = groupMap.get(key) ?? [];
      existing.push(order);
      groupMap.set(key, existing);
    }
    return Array.from(groupMap.values());
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const overdueOrders = orders.filter(
    (o) =>
      o.expectedDeliveryDate &&
      new Date(o.expectedDeliveryDate) < today &&
      o.status !== "DELIVERED" &&
      o.status !== "CANCELLED"
  );

  const statusCounts = {
    PENDING: orders.filter((o) => o.status === "PENDING").length,
    ORDERED: orders.filter((o) => o.status === "ORDERED").length,
    DELIVERED: orders.filter((o) => o.status === "DELIVERED").length,
  };

  const totalValue = orders.reduce((sum, o) => {
    return (
      sum +
      o.orderItems.reduce((s, item) => s + item.quantity * item.unitCost, 0)
    );
  }, 0);

  const allPlotsSelected =
    wizardPlots.length > 0 && selectedPlotIds.size === wizardPlots.length;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div />
        <Button size="sm" onClick={openWizard} className="gap-1.5">
          <Plus className="size-4" />
          New Order
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <ShoppingCart className="size-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-lg font-semibold">{orders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-yellow-500/10 p-2">
              <Package className="size-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-semibold">{statusCounts.PENDING}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Truck className="size-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-lg font-semibold">{statusCounts.DELIVERED}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-red-500/10 p-2">
              <AlertTriangle className="size-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-semibold">{overdueOrders.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {totalValue > 0 && (
        <p className="text-sm text-muted-foreground">
          Total order value:{" "}
          <span className="font-medium text-foreground">
            £{totalValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </span>
        </p>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.value === "all"
              ? orders.length
              : statusCounts[tab.value as keyof typeof statusCounts] ?? 0;
          return (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                filter === tab.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Order list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="mb-2 size-8 opacity-30" />
          <p className="text-sm">
            {orders.length === 0
              ? "No material orders yet"
              : "No orders match this filter"}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groupedOrders.map((group) => {
            const order = group[0]; // representative order
            const isGroupOverdue = group.some(
              (o) =>
                o.expectedDeliveryDate &&
                new Date(o.expectedDeliveryDate) < today &&
                o.status !== "DELIVERED" &&
                o.status !== "CANCELLED"
            );
            const dominantStatus = (() => {
              for (const s of ["PENDING", "ORDERED", "DELIVERED", "CANCELLED"]) {
                if (group.every((o) => o.status === s)) return s;
              }
              // mixed — pick the most "in-progress" one
              return group.find((o) => o.status === "ORDERED")?.status
                ?? group[0].status;
            })();
            const groupIds = group.map((o) => o.id);
            const anyPending = groupIds.some((id) => isStatusPending(id));
            // Items: use first order's items (same across all plots in group)
            const items = order.orderItems;
            const itemTotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
            const groupTotal = itemTotal * group.length;
            const mailto = order.supplier.contactEmail
              ? buildOrderMailto(order.supplier.contactEmail, {
                  supplierName: order.supplier.name,
                  supplierContactName: order.supplier.contactName,
                  supplierAccountNumber: order.supplier.accountNumber,
                  jobName: order.job.name,
                  siteName: siteInfo?.name || "",
                  siteAddress: siteInfo?.address,
                  sitePostcode: siteInfo?.postcode,
                  plotNumbers: group.map((g) => g.job.plot.plotNumber ? `Plot ${g.job.plot.plotNumber}` : g.job.plot.name),
                  items: items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost })),
                  itemsDescriptionFallback: order.itemsDescription,
                  expectedDeliveryDate: order.expectedDeliveryDate,
                  orderDate: order.dateOfOrder,
                })
              : null;

            return (
              <Card
                key={`${order.supplier.id}__${order.job.name}`}
                className={`text-left ${isGroupOverdue ? "border-red-200" : ""}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">
                      <Link href={`/suppliers/${order.supplier.id}`} className="hover:underline hover:text-blue-600">
                        {order.supplier.name}
                      </Link>
                    </CardTitle>
                    <span className="shrink-0">
                      <OrderStatusBadge status={dominantStatus} />
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{order.job.name}</p>
                  {/* Plot badges */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {group.slice(0, 6).map((o) => (
                      <Link
                        key={o.id}
                        href={`/sites/${siteId}/plots/${o.job.plot.id}`}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-blue-100 hover:text-blue-700"
                      >
                        {o.job.plot.plotNumber ? `P${o.job.plot.plotNumber}` : o.job.plot.name}
                      </Link>
                    ))}
                    {group.length > 6 && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        +{group.length - 6} more
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {/* Item list */}
                  {items.length > 0 && (
                    <div className="rounded border bg-slate-50 divide-y">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between px-2 py-1">
                          <span className="font-medium text-foreground truncate max-w-[120px]">{item.name}</span>
                          <span className="text-muted-foreground shrink-0 ml-2">
                            {item.quantity} {item.unit}
                            {item.unitCost > 0 && (
                              <span className="ml-1">· £{(item.quantity * item.unitCost).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Totals */}
                  {groupTotal > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {group.length > 1
                        ? `£${itemTotal.toLocaleString("en-GB", { minimumFractionDigits: 2 })} × ${group.length} plots = £${groupTotal.toLocaleString("en-GB", { minimumFractionDigits: 2 })} total`
                        : `Total: £${itemTotal.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`
                      }
                    </p>
                  )}
                  {order.itemsDescription && !items.length && (
                    <p className="text-muted-foreground">{order.itemsDescription}</p>
                  )}
                  <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground">
                    <span>Ordered {format(new Date(order.dateOfOrder), "d MMM yyyy")}</span>
                    {order.leadTimeDays != null && <span>{order.leadTimeDays}d lead</span>}
                    {order.expectedDeliveryDate && (
                      <span className={isGroupOverdue ? "font-medium text-red-600" : ""}>
                        {isGroupOverdue && <AlertTriangle className="mr-0.5 inline size-2.5" />}
                        Due {format(new Date(order.expectedDeliveryDate), "d MMM yyyy")}
                      </span>
                    )}
                  </div>
                </CardContent>
                {dominantStatus !== "DELIVERED" && dominantStatus !== "CANCELLED" && (
                  <div className="flex gap-1.5 border-t px-3 pb-3 pt-2">
                    {anyPending ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        {dominantStatus === "PENDING" && (
                          <>
                            {mailto && (
                              <Button variant="outline" size="sm"
                                className="h-6 flex-1 gap-1 border-violet-200 text-[11px] text-violet-700 hover:bg-violet-50"
                                onClick={() => { window.open(mailto, "_blank"); handleGroupStatus(groupIds, "ORDERED"); }}>
                                <Mail className="size-2.5" />{group.length > 1 ? `Send (${group.length})` : "Send Order"}
                              </Button>
                            )}
                            <Button variant="outline" size="sm"
                              className="h-6 flex-1 gap-1 border-blue-200 text-[11px] text-blue-700 hover:bg-blue-50"
                              onClick={() => handleGroupStatus(groupIds, "ORDERED")}>
                              <Package className="size-2.5" />{mailto ? "Mark Sent" : "Place Order"}
                            </Button>
                          </>
                        )}
                        {dominantStatus === "ORDERED" && (
                          <Button variant="outline" size="sm"
                            className="h-6 flex-1 gap-1 border-green-200 text-[11px] text-green-700 hover:bg-green-50"
                            onClick={() => handleGroupStatus(groupIds, "DELIVERED")}>
                            <CheckCircle2 className="size-2.5" />
                            {group.length > 1 ? `Delivered (${group.length})` : "Delivered"}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ───────────────── New Order Wizard ───────────────── */}
      <Dialog open={wizardOpen} onOpenChange={(o) => { if (!o) closeWizard(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>

          {wizardLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <WizardSteps step={wizardStep} />

              {/* ── Step 1: Select Plots ── */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Select the plots this order applies to.
                  </p>
                  <div className="flex items-center gap-2 border-b pb-2">
                    <input
                      type="checkbox"
                      id="select-all-plots"
                      checked={allPlotsSelected}
                      onChange={() => {
                        if (allPlotsSelected) {
                          setSelectedPlotIds(new Set());
                        } else {
                          setSelectedPlotIds(new Set(wizardPlots.map((p) => p.id)));
                        }
                      }}
                      className="size-4 rounded"
                    />
                    <label htmlFor="select-all-plots" className="text-sm font-medium">
                      All plots ({wizardPlots.length})
                    </label>
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {wizardPlots.map((plot) => (
                      <label
                        key={plot.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlotIds.has(plot.id)}
                          onChange={() => {
                            setSelectedPlotIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(plot.id)) next.delete(plot.id);
                              else next.add(plot.id);
                              return next;
                            });
                          }}
                          className="size-4 rounded"
                        />
                        <span className="text-sm font-medium">
                          {plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name}
                        </span>
                        {plot.houseType && (
                          <span className="text-xs text-muted-foreground">
                            {plot.houseType}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 2: Select Stage/Job ── */}
              {wizardStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Select the job stage this order is for. Orders will be created for matching jobs across the {selectedPlotIds.size} selected plot{selectedPlotIds.size !== 1 ? "s" : ""}.
                  </p>
                  <div className="max-h-72 space-y-3 overflow-y-auto">
                    {availableJobGroups.map(([group, names]) => (
                      <div key={group}>
                        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {group}
                        </p>
                        {names.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setSelectedJobName(name)}
                            className={`mb-0.5 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                              selectedJobName === name
                                ? "bg-blue-600 text-white"
                                : "hover:bg-slate-100"
                            }`}
                          >
                            <span>{name}</span>
                            {selectedJobName === name && (
                              <Check className="size-4 shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                    {availableJobGroups.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No jobs found on selected plots
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 3: Order Details ── */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Supplier *</Label>
                    <Select value={supplierId} onValueChange={(v) => { if (v !== null) setSupplierId(v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier">
                          {supplierId
                            ? (wizardSuppliers.find((s) => s.id === supplierId)?.name ?? "Select supplier")
                            : "Select supplier"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {wizardSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quick-add from supplier catalogue */}
                  {supplierId && supplierMaterials.length > 0 && (
                    <div className="rounded-md border">
                      <button
                        type="button"
                        onClick={() => setCatalogueOpen((o) => !o)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-slate-50"
                      >
                        <span>
                          Add from catalogue
                          <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {supplierMaterials.length}
                          </span>
                        </span>
                        <ChevronRight className={`size-3.5 transition-transform ${catalogueOpen ? "rotate-90" : ""}`} />
                      </button>
                      {catalogueOpen && (
                        <div className="max-h-40 overflow-y-auto border-t">
                          {supplierMaterials.map((mat) => {
                            const alreadyAdded = orderItems.some((i) => i.name.toLowerCase() === mat.name.toLowerCase());
                            return (
                              <button
                                key={mat.name}
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => {
                                  if (alreadyAdded) return;
                                  setOrderItems((prev) => [
                                    ...prev,
                                    {
                                      id: crypto.randomUUID(),
                                      name: mat.name,
                                      qtyPerPlot: "1",
                                      unit: mat.unit,
                                      unitCost: mat.unitCost > 0 ? String(mat.unitCost) : "",
                                    },
                                  ]);
                                }}
                                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                                  alreadyAdded
                                    ? "bg-green-50 text-green-700 opacity-60 cursor-default"
                                    : "hover:bg-blue-50 hover:text-blue-700"
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  {alreadyAdded
                                    ? <Check className="size-3 shrink-0 text-green-600" />
                                    : <Plus className="size-3 shrink-0 text-muted-foreground" />}
                                  {mat.name}
                                </span>
                                {mat.unitCost > 0 && (
                                  <span className="shrink-0 text-muted-foreground">£{mat.unitCost} / {mat.unit}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Line-item builder */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Items</Label>
                      <button
                        type="button"
                        onClick={() =>
                          setOrderItems((prev) => [
                            ...prev,
                            { id: crypto.randomUUID(), name: "", qtyPerPlot: "1", unit: "", unitCost: "" },
                          ])
                        }
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Plus className="size-3" />
                        Add item
                      </button>
                    </div>

                    {orderItems.length === 0 ? (
                      <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No items added — click &ldquo;Add item&rdquo; above
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_60px_60px_72px_20px] gap-1.5 px-0.5 text-[10px] font-medium text-muted-foreground">
                          <span>Item</span>
                          <span>Qty/plot</span>
                          <span>Unit</span>
                          <span>Unit cost</span>
                          <span />
                        </div>
                        {orderItems.map((item) => (
                          <div key={item.id} className="grid grid-cols-[1fr_60px_60px_72px_20px] items-center gap-1.5">
                            <Input
                              placeholder="e.g. Facing bricks"
                              value={item.name}
                              onChange={(e) =>
                                setOrderItems((prev) =>
                                  prev.map((i) => i.id === item.id ? { ...i, name: e.target.value } : i)
                                )
                              }
                              className="h-7 text-xs"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="1"
                              value={item.qtyPerPlot}
                              onChange={(e) =>
                                setOrderItems((prev) =>
                                  prev.map((i) => i.id === item.id ? { ...i, qtyPerPlot: e.target.value } : i)
                                )
                              }
                              className="h-7 text-xs"
                            />
                            <Input
                              placeholder="no."
                              value={item.unit}
                              onChange={(e) =>
                                setOrderItems((prev) =>
                                  prev.map((i) => i.id === item.id ? { ...i, unit: e.target.value } : i)
                                )
                              }
                              className="h-7 text-xs"
                            />
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">£</span>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0.00"
                                value={item.unitCost}
                                onChange={(e) =>
                                  setOrderItems((prev) =>
                                    prev.map((i) => i.id === item.id ? { ...i, unitCost: e.target.value } : i)
                                  )
                                }
                                className="h-7 pl-5 text-xs"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setOrderItems((prev) => prev.filter((i) => i.id !== item.id))}
                              className="flex items-center justify-center text-muted-foreground hover:text-red-500"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                        {/* Per-plot total */}
                        {orderItems.some((i) => parseFloat(i.unitCost) > 0) && (
                          <p className="text-right text-[11px] text-muted-foreground">
                            Per plot:{" "}
                            <span className="font-medium text-foreground">
                              £{orderItems.reduce((sum, i) => sum + (parseFloat(i.qtyPerPlot) || 0) * (parseFloat(i.unitCost) || 0), 0).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Lead time (days)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                      placeholder="14"
                    />
                    {deliveryDate && (
                      <p className="text-xs text-muted-foreground">
                        Expected delivery:{" "}
                        <span className="font-medium text-foreground">
                          {format(deliveryDate, "d MMM yyyy")}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 4: Review ── */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                    <p className="font-medium">
                      {matchingJobs.length} order{matchingJobs.length !== 1 ? "s" : ""} for{" "}
                      <span className="text-blue-600">{selectedJobName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {wizardSuppliers.find((s) => s.id === supplierId)?.name} ·{" "}
                      {deliveryDate ? `Due ${format(deliveryDate, "d MMM yyyy")}` : "No delivery date"}
                    </p>
                    {reviewTotalCost > 0 && (
                      <p className="mt-1 text-xs font-medium text-foreground">
                        Total value: £{reviewTotalCost.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                        {matchingJobs.length > 1 && (
                          <span className="font-normal text-muted-foreground"> (£{reviewPerPlotCost.toLocaleString("en-GB", { minimumFractionDigits: 2 })} × {matchingJobs.length} plots)</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Line items summary */}
                  {reviewParsedItems.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Items per plot</p>
                      {reviewParsedItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-xs">
                          <span>{item.name}</span>
                          <span className="text-muted-foreground">
                            {item.qtyPerPlot || "1"} {item.unit || "units"}
                            {parseFloat(item.unitCost) > 0 && (
                              <> · £{((parseFloat(item.qtyPerPlot) || 1) * parseFloat(item.unitCost)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {deliveryWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div>
                          <p className="font-medium">Late delivery warning</p>
                          <p className="mt-0.5 text-xs">
                            Delivery date ({deliveryDate ? format(deliveryDate, "d MMM") : "—"}) is after the job start date on {deliveryWarnings.length} plot{deliveryWarnings.length !== 1 ? "s" : ""}:
                          </p>
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {deliveryWarnings.map((w) => (
                              <li key={w.plotId}>
                                {w.plotNumber ? `Plot ${w.plotNumber}` : w.plotName} — job starts{" "}
                                {w.job.startDate ? format(new Date(w.job.startDate), "d MMM yyyy") : "unknown"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {matchingJobs.map(({ plotId, plotName, plotNumber, job }) => (
                      <div
                        key={plotId}
                        className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium">
                          {plotNumber ? `Plot ${plotNumber}` : plotName}
                        </span>
                        <span className="text-muted-foreground">
                          {job.startDate
                            ? `Starts ${format(new Date(job.startDate), "d MMM")}`
                            : job.status}
                        </span>
                      </div>
                    ))}
                    {matchingJobs.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No matching jobs found on selected plots
                      </p>
                    )}
                  </div>

                  {createError && (
                    <p className="text-sm text-red-600">{createError}</p>
                  )}
                </div>
              )}

              {/* Navigation */}
              <DialogFooter className="mt-2 flex-row items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => wizardStep === 1 ? closeWizard() : setWizardStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                >
                  {wizardStep === 1 ? (
                    "Cancel"
                  ) : (
                    <>
                      <ChevronLeft className="size-4" />
                      Back
                    </>
                  )}
                </Button>

                {wizardStep < 4 ? (
                  <Button
                    size="sm"
                    disabled={
                      (wizardStep === 1 && selectedPlotIds.size === 0) ||
                      (wizardStep === 2 && !selectedJobName) ||
                      (wizardStep === 3 && !supplierId)
                    }
                    onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={creating || matchingJobs.length === 0}
                    onClick={handleCreate}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      `Create ${matchingJobs.length} Order${matchingJobs.length !== 1 ? "s" : ""}`
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
