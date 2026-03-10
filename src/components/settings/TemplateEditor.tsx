"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  Package,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Check,
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
import { TemplateTimeline } from "./TemplateTimeline";
import type {
  TemplateData,
  TemplateJobData,
  TemplateOrderData,
  SupplierData,
} from "./types";

interface MaterialSuggestion {
  name: string;
  unit: string;
  unitCost: number;
}

// ---------- Main Editor ----------

interface TemplateEditorProps {
  template: TemplateData;
  onBack: () => void;
  onUpdate: (template: TemplateData) => void;
}

export function TemplateEditor({
  template,
  onBack,
  onUpdate,
}: TemplateEditorProps) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(template.name);
  const [metaDescription, setMetaDescription] = useState(
    template.description ?? ""
  );
  const [metaTypeLabel, setMetaTypeLabel] = useState(template.typeLabel ?? "");
  const [savingMeta, setSavingMeta] = useState(false);

  // Job dialog
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<TemplateJobData | null>(null);
  const [jobName, setJobName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobStartWeek, setJobStartWeek] = useState(1);
  const [jobEndWeek, setJobEndWeek] = useState(2);
  const [jobStageCode, setJobStageCode] = useState("");
  const [savingJob, setSavingJob] = useState(false);

  // Order dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<TemplateOrderData | null>(
    null
  );
  const [orderJobId, setOrderJobId] = useState("");
  const [orderDescription, setOrderDescription] = useState("");
  const [orderWeekOffset, setOrderWeekOffset] = useState(-2);
  const [deliveryWeekOffset, setDeliveryWeekOffset] = useState(0);
  const [orderSupplierId, setOrderSupplierId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<
    Array<{ name: string; quantity: number; unit: string; unitCost: number }>
  >([]);
  const [savingOrder, setSavingOrder] = useState(false);

  // Suppliers
  const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
  const [suppliersLoaded, setSuppliersLoaded] = useState(false);
  const [materialSuggestions, setMaterialSuggestions] = useState<MaterialSuggestion[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  // Expanded jobs
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  // Delete states
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleteJobDialogOpen, setDeleteJobDialogOpen] = useState(false);
  const [deleteOrderDialogOpen, setDeleteOrderDialogOpen] = useState(false);

  // Load suppliers once
  useEffect(() => {
    if (!suppliersLoaded) {
      fetch("/api/suppliers")
        .then((r) => r.json())
        .then((data) => {
          setSuppliers(data);
          setSuppliersLoaded(true);
        })
        .catch(console.error);
    }
  }, [suppliersLoaded]);

  // Load materials when supplier changes
  useEffect(() => {
    if (!orderSupplierId) {
      setMaterialSuggestions([]);
      return;
    }
    setLoadingMaterials(true);
    fetch(`/api/suppliers/${orderSupplierId}/materials`)
      .then((r) => r.json())
      .then((data) => {
        setMaterialSuggestions(data);
      })
      .catch(console.error)
      .finally(() => setLoadingMaterials(false));
  }, [orderSupplierId]);

  function toggleJobExpand(jobId: string) {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  // ---------- Timeline drag handler ----------

  const handleTimelineJobUpdate = useCallback(
    async (jobId: string, startWeek: number, endWeek: number) => {
      try {
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${jobId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ startWeek, endWeek }),
          }
        );
        if (!res.ok) throw new Error("Failed to update job");

        const tplRes = await fetch(`/api/plot-templates/${template.id}`);
        const updated = await tplRes.json();
        onUpdate(updated);
      } catch (error) {
        console.error("Failed to update job via timeline:", error);
      }
    },
    [template.id, onUpdate]
  );

  // ---------- Save template metadata ----------

  async function handleSaveMeta() {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/plot-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: metaName,
          description: metaDescription || null,
          typeLabel: metaTypeLabel || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update template");
      const updated = await res.json();
      onUpdate(updated);
      setEditingMeta(false);
    } catch (error) {
      console.error("Failed to update template:", error);
    } finally {
      setSavingMeta(false);
    }
  }

  // ---------- Job CRUD ----------

  function openAddJob() {
    setEditingJob(null);
    const maxEndWeek =
      template.jobs.length > 0
        ? Math.max(...template.jobs.map((j) => j.endWeek))
        : 0;
    setJobName("");
    setJobDescription("");
    setJobStartWeek(maxEndWeek + 1);
    setJobEndWeek(maxEndWeek + 2);
    setJobStageCode("");
    setJobDialogOpen(true);
  }

  function openEditJob(job: TemplateJobData) {
    setEditingJob(job);
    setJobName(job.name);
    setJobDescription(job.description ?? "");
    setJobStartWeek(job.startWeek);
    setJobEndWeek(job.endWeek);
    setJobStageCode(job.stageCode ?? "");
    setJobDialogOpen(true);
  }

  async function handleSaveJob() {
    if (!jobName.trim()) return;
    setSavingJob(true);
    try {
      if (editingJob) {
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${editingJob.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: jobName,
              description: jobDescription || null,
              stageCode: jobStageCode || null,
              startWeek: jobStartWeek,
              endWeek: jobEndWeek,
            }),
          }
        );
        if (!res.ok) throw new Error("Failed to update job");
      } else {
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: jobName,
              description: jobDescription || null,
              stageCode: jobStageCode || null,
              sortOrder: template.jobs.length,
              startWeek: jobStartWeek,
              endWeek: jobEndWeek,
            }),
          }
        );
        if (!res.ok) throw new Error("Failed to create job");
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`);
      const updated = await tplRes.json();
      onUpdate(updated);
      setJobDialogOpen(false);
    } catch (error) {
      console.error("Failed to save job:", error);
    } finally {
      setSavingJob(false);
    }
  }

  async function handleDeleteJob() {
    if (!deletingJobId) return;
    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/jobs/${deletingJobId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete job");

      const tplRes = await fetch(`/api/plot-templates/${template.id}`);
      const updated = await tplRes.json();
      onUpdate(updated);
      setDeleteJobDialogOpen(false);
      setDeletingJobId(null);
    } catch (error) {
      console.error("Failed to delete job:", error);
    }
  }

  // ---------- Order CRUD ----------

  function openAddOrder(jobId: string) {
    setEditingOrder(null);
    setOrderJobId(jobId);
    setOrderDescription("");
    setOrderWeekOffset(-2);
    setDeliveryWeekOffset(0);
    setOrderSupplierId(null);
    setOrderItems([]);
    setMaterialSuggestions([]);
    setOrderDialogOpen(true);
  }

  function openEditOrder(jobId: string, order: TemplateOrderData) {
    setEditingOrder(order);
    setOrderJobId(jobId);
    setOrderDescription(order.itemsDescription ?? "");
    setOrderWeekOffset(order.orderWeekOffset);
    setDeliveryWeekOffset(order.deliveryWeekOffset);
    setOrderSupplierId(order.supplierId);
    setOrderItems(
      order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitCost: item.unitCost,
      }))
    );
    setOrderDialogOpen(true);
  }

  async function handleSaveOrder() {
    setSavingOrder(true);
    try {
      const payload = {
        itemsDescription: orderDescription || null,
        orderWeekOffset,
        deliveryWeekOffset,
        supplierId: orderSupplierId,
        items: orderItems.filter((item) => item.name.trim()),
      };

      if (editingOrder) {
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${orderJobId}/orders/${editingOrder.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) throw new Error("Failed to update order");
      } else {
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${orderJobId}/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) throw new Error("Failed to create order");
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`);
      const updated = await tplRes.json();
      onUpdate(updated);
      setOrderDialogOpen(false);
    } catch (error) {
      console.error("Failed to save order:", error);
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleDeleteOrder() {
    if (!deletingOrderId || !orderJobId) return;
    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/jobs/${orderJobId}/orders/${deletingOrderId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete order");

      const tplRes = await fetch(`/api/plot-templates/${template.id}`);
      const updated = await tplRes.json();
      onUpdate(updated);
      setDeleteOrderDialogOpen(false);
      setDeletingOrderId(null);
    } catch (error) {
      console.error("Failed to delete order:", error);
    }
  }

  // ---------- Order items helpers ----------

  function addOrderItem() {
    setOrderItems((prev) => [
      ...prev,
      { name: "", quantity: 1, unit: "units", unitCost: 0 },
    ]);
  }

  function addMaterialToOrder(material: MaterialSuggestion) {
    // Check if already in items list
    const exists = orderItems.some(
      (item) => item.name.toLowerCase() === material.name.toLowerCase()
    );
    if (exists) return;
    setOrderItems((prev) => [
      ...prev,
      {
        name: material.name,
        quantity: 1,
        unit: material.unit,
        unitCost: material.unitCost,
      },
    ]);
  }

  function updateOrderItem(
    index: number,
    field: string,
    value: string | number
  ) {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function removeOrderItem(index: number) {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to Templates
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingMeta ? (
              <div className="space-y-3">
                <Input
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  className="text-lg font-bold"
                />
                <Input
                  value={metaTypeLabel}
                  onChange={(e) => setMetaTypeLabel(e.target.value)}
                  placeholder="Type label (e.g. Detached 4-Bed)"
                  className="text-sm"
                />
                <Textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Description..."
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveMeta}
                    disabled={savingMeta || !metaName.trim()}
                  >
                    <Save className="size-3.5" />
                    {savingMeta ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingMeta(false);
                      setMetaName(template.name);
                      setMetaDescription(template.description ?? "");
                      setMetaTypeLabel(template.typeLabel ?? "");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {template.name}
                  </h2>
                  {template.typeLabel && (
                    <Badge variant="secondary">{template.typeLabel}</Badge>
                  )}
                </div>
                {template.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {template.description}
                  </p>
                )}
              </div>
            )}
          </div>
          {!editingMeta && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingMeta(true)}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Timeline Preview - now interactive */}
      {template.jobs.length > 0 && (
        <TemplateTimeline
          jobs={template.jobs}
          onJobUpdate={handleTimelineJobUpdate}
        />
      )}

      {/* Jobs List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Jobs</h3>
          <Button size="sm" onClick={openAddJob}>
            <Plus className="size-3.5" />
            Add Job
          </Button>
        </div>

        {template.jobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No jobs yet. Add your first job to define the build stages.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {template.jobs.map((job, index) => {
              const isExpanded = expandedJobs.has(job.id);
              return (
                <Card
                  key={job.id}
                  className="overflow-hidden border-border/50"
                >
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/50"
                    onClick={() => toggleJobExpand(job.id)}
                  >
                    <GripVertical className="size-4 shrink-0 text-muted-foreground/40" />
                    {isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {index + 1}.
                        </span>
                        <span className="font-medium">{job.name}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                        >
                          Wk {job.startWeek}–{job.endWeek}
                        </Badge>
                        {job.orders.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Package className="size-3" />
                            {job.orders.length}
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {job.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditJob(job);
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingJobId(job.id);
                          setDeleteJobDialogOpen(true);
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: Orders */}
                  {isExpanded && (
                    <div className="border-t bg-slate-50/30 px-4 py-3">
                      <div className="ml-9 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase">
                            Material Orders
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openAddOrder(job.id)}
                          >
                            <Plus className="size-3" />
                            Add Order
                          </Button>
                        </div>

                        {job.orders.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No orders for this job.
                          </p>
                        ) : (
                          job.orders.map((order) => (
                            <div
                              key={order.id}
                              className="rounded-lg border bg-white p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">
                                      {order.itemsDescription || "Material Order"}
                                    </p>
                                    {order.supplier && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {order.supplier.name}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>
                                      Order: {order.orderWeekOffset >= 0 ? "+" : ""}
                                      {order.orderWeekOffset}w from job start
                                    </span>
                                    <span>
                                      Delivery: {order.deliveryWeekOffset >= 0 ? "+" : ""}
                                      {order.deliveryWeekOffset}w from order
                                    </span>
                                  </div>
                                  {order.items.length > 0 && (
                                    <div className="mt-2 space-y-0.5">
                                      {order.items.map((item) => (
                                        <div
                                          key={item.id}
                                          className="text-xs text-muted-foreground"
                                        >
                                          {item.quantity} {item.unit} &times;{" "}
                                          {item.name}
                                          {item.unitCost > 0 &&
                                            ` @ £${item.unitCost.toFixed(2)}`}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={() =>
                                      openEditOrder(job.id, order)
                                    }
                                    className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOrderJobId(job.id);
                                      setDeletingOrderId(order.id);
                                      setDeleteOrderDialogOpen(true);
                                    }}
                                    className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Job Add/Edit Dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingJob ? "Edit Job" : "Add Job"}
            </DialogTitle>
            <DialogDescription>
              {editingJob
                ? "Update this template job."
                : "Add a new job stage to this template."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Job Name</Label>
              <Input
                placeholder="e.g. Groundworks"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Stage Code</Label>
              <Input
                placeholder="e.g. FND, DPC, B1 (max 4 chars)"
                value={jobStageCode}
                onChange={(e) =>
                  setJobStageCode(e.target.value.toUpperCase().slice(0, 4))
                }
                maxLength={4}
                className="w-32"
              />
              <p className="text-[11px] text-muted-foreground">
                Short code for the programme view. Auto-generated if empty.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Week</Label>
                <Input
                  type="number"
                  min={1}
                  value={jobStartWeek}
                  onChange={(e) =>
                    setJobStartWeek(parseInt(e.target.value) || 1)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Week</Label>
                <Input
                  type="number"
                  min={jobStartWeek}
                  value={jobEndWeek}
                  onChange={(e) =>
                    setJobEndWeek(parseInt(e.target.value) || jobStartWeek)
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
              onClick={handleSaveJob}
              disabled={savingJob || !jobName.trim()}
            >
              {savingJob
                ? "Saving..."
                : editingJob
                  ? "Update Job"
                  : "Add Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Add/Edit Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingOrder ? "Edit Order" : "Add Order"}
            </DialogTitle>
            <DialogDescription>
              {editingOrder
                ? "Update this material order."
                : "Add a material order to this job."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
            {/* Supplier selector */}
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select
                value={orderSupplierId ?? "none"}
                onValueChange={(v) => {
                  if (v === null) return;
                  setOrderSupplierId(v === "none" ? null : v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {orderSupplierId
                      ? suppliers.find((s) => s.id === orderSupplierId)?.name ?? "Loading..."
                      : "No supplier"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="e.g. Concrete supply for foundations"
                value={orderDescription}
                onChange={(e) => setOrderDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Order Offset (weeks)</Label>
                <Input
                  type="number"
                  value={orderWeekOffset}
                  onChange={(e) =>
                    setOrderWeekOffset(parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Relative to job start. Use negative for before (e.g. -2 = 2
                  weeks before).
                </p>
              </div>
              <div className="space-y-2">
                <Label>Delivery Offset (weeks)</Label>
                <Input
                  type="number"
                  value={deliveryWeekOffset}
                  onChange={(e) =>
                    setDeliveryWeekOffset(parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Relative to order date. 0 = on order date.
                </p>
              </div>
            </div>

            {/* Material Suggestions from Supplier */}
            {orderSupplierId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Materials from supplier
                  {loadingMaterials && (
                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                  )}
                </Label>
                {!loadingMaterials && materialSuggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No previous materials found for this supplier.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {materialSuggestions.map((m) => {
                      const isAdded = orderItems.some(
                        (item) =>
                          item.name.toLowerCase() === m.name.toLowerCase()
                      );
                      return (
                        <button
                          key={m.name}
                          type="button"
                          onClick={() => !isAdded && addMaterialToOrder(m)}
                          disabled={isAdded}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            isAdded
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                          }`}
                        >
                          {isAdded ? (
                            <Check className="size-3" />
                          ) : (
                            <Plus className="size-3" />
                          )}
                          {m.name}
                          {m.unitCost > 0 && (
                            <span className="text-muted-foreground">
                              £{m.unitCost.toFixed(2)}/{m.unit}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Order Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addOrderItem}
                >
                  <Plus className="size-3" />
                  Add Item
                </Button>
              </div>

              {orderItems.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_60px_70px_70px_28px] gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span>Name</span>
                    <span>Qty</span>
                    <span>Unit</span>
                    <span>Cost</span>
                    <span />
                  </div>
                  {orderItems.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_60px_70px_70px_28px] gap-1.5"
                    >
                      <Input
                        placeholder="Item name"
                        value={item.name}
                        onChange={(e) =>
                          updateOrderItem(index, "name", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateOrderItem(
                            index,
                            "quantity",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="units"
                        value={item.unit}
                        onChange={(e) =>
                          updateOrderItem(index, "unit", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(e) =>
                          updateOrderItem(
                            index,
                            "unitCost",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="h-8 text-xs"
                      />
                      <button
                        onClick={() => removeOrderItem(index)}
                        className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleSaveOrder} disabled={savingOrder}>
              {savingOrder
                ? "Saving..."
                : editingOrder
                  ? "Update Order"
                  : "Add Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Job Dialog */}
      <Dialog
        open={deleteJobDialogOpen}
        onOpenChange={setDeleteJobDialogOpen}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Job</DialogTitle>
            <DialogDescription>
              This will permanently delete this job and all its orders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteJob}>
              Delete Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Order Dialog */}
      <Dialog
        open={deleteOrderDialogOpen}
        onOpenChange={setDeleteOrderDialogOpen}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Order</DialogTitle>
            <DialogDescription>
              This will permanently delete this order and its items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteOrder}>
              Delete Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
