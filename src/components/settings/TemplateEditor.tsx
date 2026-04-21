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
  Layers,
  GitBranch,
  AlertTriangle,
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
import {
  UK_HOUSEBUILDING_STAGES,
  getStageTotalWeeks,
  CUSTOM_STAGE_KEY,
} from "@/lib/stage-library";
import type { StageDefinition } from "@/lib/stage-library";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { HelpTip } from "@/components/shared/HelpTip";

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
  const toast = useToast();
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(template.name);
  const [metaDescription, setMetaDescription] = useState(
    template.description ?? ""
  );
  const [metaTypeLabel, setMetaTypeLabel] = useState(template.typeLabel ?? "");
  const [savingMeta, setSavingMeta] = useState(false);

  // Job edit dialog (used for both stages and sub-jobs)
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<TemplateJobData | null>(null);
  const [jobName, setJobName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobStartWeek, setJobStartWeek] = useState(1);
  const [jobEndWeek, setJobEndWeek] = useState(2);
  // Days override on edit — lets you set a leaf job to e.g. 3 working
  // days spanning less than a full week (Q6 Apr 2026 for stages + sub-jobs).
  const [jobDurationDays, setJobDurationDays] = useState<number | "">("");
  const [jobStageCode, setJobStageCode] = useState("");
  const [jobWeatherAffected, setJobWeatherAffected] = useState(false);
  const [jobWeatherAffectedType, setJobWeatherAffectedType] = useState<"RAIN" | "TEMPERATURE" | "BOTH" | null>(null);
  const [jobContractorId, setJobContractorId] = useState("");
  const [savingJob, setSavingJob] = useState(false);

  // Add Stage dialog
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [selectedStageCodes, setSelectedStageCodes] = useState<Set<string>>(
    new Set()
  );
  const [savingStage, setSavingStage] = useState(false);
  // Drag-to-reorder state for stages. HTML5 native drag.
  // draggedJobId is the top-level job currently being dragged;
  // dragOverJobId highlights the drop target as you hover.
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);
  // Custom stage fields
  const [customStageName, setCustomStageName] = useState("");
  const [customStageCode, setCustomStageCode] = useState("");
  const [customSubJobs, setCustomSubJobs] = useState<
    Array<{ name: string; code: string; duration: number }>
  >([]);

  // Add Sub-Job dialog — subJobDurationUnit toggle lets user pick days
  // or weeks. Days wins at apply time (see apply-template-helpers).
  const [subJobDialogOpen, setSubJobDialogOpen] = useState(false);
  const [subJobParentId, setSubJobParentId] = useState<string | null>(null);
  const [subJobParentChildren, setSubJobParentChildren] = useState(0);
  const [subJobParentStartWeek, setSubJobParentStartWeek] = useState(1);
  const [subJobParentEndWeek, setSubJobParentEndWeek] = useState(1);
  const [subJobName, setSubJobName] = useState("");
  const [subJobCode, setSubJobCode] = useState("");
  const [subJobDuration, setSubJobDuration] = useState(1);
  const [subJobDurationUnit, setSubJobDurationUnit] = useState<"weeks" | "days">("weeks");
  const [subJobContractorId, setSubJobContractorId] = useState("");
  const [savingSubJob, setSavingSubJob] = useState(false);

  // Order dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<TemplateOrderData | null>(
    null
  );
  const [orderJobId, setOrderJobId] = useState("");
  const [orderDescription, setOrderDescription] = useState("");
  const [anchorType, setAnchorType] = useState<"order" | "arrive">("order");
  const [anchorAmount, setAnchorAmount] = useState(2);
  const [anchorUnit, setAnchorUnit] = useState<"days" | "weeks">("weeks");
  const [anchorDirection, setAnchorDirection] = useState<"before" | "after">("before");
  const [anchorRefJobId, setAnchorRefJobId] = useState<string | null>(null);
  const [leadTimeAmount, setLeadTimeAmount] = useState(4);
  const [leadTimeUnit, setLeadTimeUnit] = useState<"days" | "weeks">("weeks");
  const [orderSupplierId, setOrderSupplierId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<
    Array<{ name: string; quantity: number; unit: string; unitCost: number }>
  >([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Suppliers
  const [suppliers, setSuppliers] = useState<SupplierData[]>([]);
  const [suppliersLoaded, setSuppliersLoaded] = useState(false);

  // Contractors (for assigning to template jobs)
  const [contractors, setContractors] = useState<Array<{ id: string; name: string; company: string | null }>>([]);
  const [contractorsLoaded, setContractorsLoaded] = useState(false);
  const [materialSuggestions, setMaterialSuggestions] = useState<
    MaterialSuggestion[]
  >([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  // Expanded jobs
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  // Inline duration editing
  const [editingDurations, setEditingDurations] = useState<
    Record<string, number>
  >({});

  // Delete states
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleteJobDialogOpen, setDeleteJobDialogOpen] = useState(false);
  const [deleteOrderDialogOpen, setDeleteOrderDialogOpen] = useState(false);

  // Split flat job into sub-jobs
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  // Q5 Apr 2026: when splitting a flat job that has orders, ask where
  // those orders should go. "keep" leaves them on the new parent stage
  // (default, no disruption). "index:N" moves them to the Nth new sub-job.
  const [splitOrderTarget, setSplitOrderTarget] = useState<string>("keep");
  // Count of orders that currently live on the job being split — used
  // to decide whether the "orders-go-where" picker is worth showing.
  const [splitOrderCount, setSplitOrderCount] = useState(0);
  const [splitJobId, setSplitJobId] = useState<string | null>(null);
  const [splitJobName, setSplitJobName] = useState("");
  const [splitSubJobs, setSplitSubJobs] = useState<
    Array<{ name: string; code: string; duration: number }>
  >([]);
  const [savingSplit, setSavingSplit] = useState(false);

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

  // Load contractors once
  useEffect(() => {
    if (!contractorsLoaded) {
      fetch("/api/contacts?type=CONTRACTOR")
        .then((r) => r.json())
        .then((data) => {
          setContractors(data);
          setContractorsLoaded(true);
        })
        .catch(console.error);
    }
  }, [contractorsLoaded]);

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

  // ---------- Drag-to-reorder stages (Q4 Apr 2026) ----------

  /** Persist new sort orders for a reordered stage list. Calls PUT in
   *  parallel for every job whose sortOrder actually changed. */
  async function persistStageOrder(reorderedJobs: TemplateJobData[]) {
    const updates = reorderedJobs
      .map((job, newIdx) => ({ job, newIdx }))
      .filter(({ job, newIdx }) => job.sortOrder !== newIdx);
    if (updates.length === 0) return;

    try {
      await Promise.all(
        updates.map(({ job, newIdx }) =>
          fetch(`/api/plot-templates/${template.id}/jobs/${job.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: newIdx }),
          })
        )
      );
      // Re-fetch template to get normalised state.
      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      if (tplRes.ok) {
        const updated = await tplRes.json();
        onUpdate(updated);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save new order");
    }
  }

  /** Handle drop: reorder the stage list, clear drag state, persist. */
  function handleStageDrop(targetJobId: string) {
    if (!draggedJobId || draggedJobId === targetJobId) {
      setDraggedJobId(null);
      setDragOverJobId(null);
      return;
    }
    const stages = [...template.jobs];
    const fromIdx = stages.findIndex((j) => j.id === draggedJobId);
    const toIdx = stages.findIndex((j) => j.id === targetJobId);
    if (fromIdx < 0 || toIdx < 0) return;
    // Remove from current position, insert before the target.
    const [moved] = stages.splice(fromIdx, 1);
    stages.splice(toIdx, 0, moved);
    // Optimistic local update
    onUpdate({ ...template, jobs: stages });
    setDraggedJobId(null);
    setDragOverJobId(null);
    void persistStageOrder(stages);
  }

  // ---------- Split flat job into sub-jobs ----------

  function openSplitDialog(job: TemplateJobData) {
    setSplitJobId(job.id);
    setSplitJobName(job.name);
    // Reset order-routing to default ("keep") and remember how many
    // orders exist so the picker only appears when there's something
    // to route.
    setSplitOrderTarget("keep");
    setSplitOrderCount(job.orders?.length ?? 0);

    // Check if job matches a library stage by name or code
    const libraryMatch = UK_HOUSEBUILDING_STAGES.find(
      (s) =>
        s.name.toLowerCase() === job.name.toLowerCase() ||
        s.code === job.stageCode
    );

    if (libraryMatch) {
      // Pre-populate with library sub-jobs
      setSplitSubJobs(
        libraryMatch.subJobs.map((sj) => ({
          name: sj.name,
          code: sj.code,
          duration: sj.defaultDuration,
        }))
      );
    } else {
      // Start with one empty row
      setSplitSubJobs([{ name: "", code: "", duration: 1 }]);
    }
    setSplitDialogOpen(true);
  }

  async function handleSplit() {
    if (!splitJobId || splitSubJobs.length === 0) return;
    // Validate all sub-jobs have a name
    if (splitSubJobs.some((sj) => !sj.name.trim())) return;

    setSavingSplit(true);
    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/jobs/${splitJobId}/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subJobs: splitSubJobs.map((sj) => ({
              name: sj.name.trim(),
              code:
                sj.code.trim() ||
                sj.name.trim().substring(0, 3).toUpperCase(),
              duration: sj.duration || 1,
            })),
            orderTarget: splitOrderCount > 0 ? splitOrderTarget : undefined,
          }),
        }
      );
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to split job"));
        return;
      }
      const updated = await res.json();
      onUpdate(updated);
      setSplitDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to split job");
    } finally {
      setSavingSplit(false);
    }
  }

  // ---------- Timeline bar click → scroll to job ----------

  const handleBarClick = useCallback((jobId: string, parentJobId?: string) => {
    // Expand the parent stage first (if sub-job), then the job itself
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (parentJobId) next.add(parentJobId);
      next.add(jobId);
      return next;
    });
    // Scroll to the card — use the parent card if it's a sub-job
    const targetId = parentJobId ?? jobId;
    setTimeout(() => {
      const el = document.querySelector(`[data-job-id="${targetId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  // ---------- Timeline drag handler ----------

  const handleTimelineJobUpdate = useCallback(
    async (jobId: string, startWeek: number, endWeek: number) => {
      try {
        // Find job — could be a top-level stage or a nested sub-job
        const topJob = template.jobs.find((j) => j.id === jobId);
        const subJob = !topJob
          ? template.jobs
              .flatMap((j) => j.children || [])
              .find((c) => c.id === jobId)
          : null;
        const job = topJob || subJob;

        // For sub-jobs, also update durationWeeks so recalculate uses correct value
        const durationWeeks = endWeek - startWeek + 1;
        const body = subJob
          ? { startWeek, endWeek, durationWeeks }
          : { startWeek, endWeek };

        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${jobId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) throw new Error("Failed to update job");

        // If the job has children (parent stage moved), recalculate children
        if (job && job.children && job.children.length > 0) {
          await fetch(
            `/api/plot-templates/${template.id}/jobs/${jobId}/recalculate`,
            { method: "POST" }
          );
        }

        // If the job is a sub-job, recalculate the parent to update its span
        if (subJob && subJob.parentId) {
          await fetch(
            `/api/plot-templates/${template.id}/jobs/${subJob.parentId}/recalculate`,
            { method: "POST" }
          );
        }

        const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
        const updated = await tplRes.json();
        onUpdate(updated);
      } catch (error) {
        console.error("Failed to update job via timeline:", error);
        toast.error(error instanceof Error ? `Failed to update timeline: ${error.message}` : "Failed to update timeline");
      }
    },
    [template.id, template.jobs, onUpdate, toast]
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
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to update template"));
        return;
      }
      const updated = await res.json();
      onUpdate(updated);
      setEditingMeta(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update template");
    } finally {
      setSavingMeta(false);
    }
  }

  // ---------- Add Stage ----------

  function openAddStage() {
    setSelectedStageCodes(new Set());
    setCustomStageName("");
    setCustomStageCode("");
    setCustomSubJobs([]);
    setStageDialogOpen(true);
  }

  function toggleStageCode(code: string) {
    setSelectedStageCodes((prev) => {
      const next = new Set(prev);
      // If switching to/from custom, clear predefined selections
      if (code === CUSTOM_STAGE_KEY) {
        return next.has(CUSTOM_STAGE_KEY) ? new Set() : new Set([CUSTOM_STAGE_KEY]);
      }
      // If custom is selected, clear it first
      next.delete(CUSTOM_STAGE_KEY);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  function selectAllStages() {
    const existingCodes = new Set(
      template.jobs.filter((j) => !j.parentId).map((j) => j.stageCode)
    );
    const available = UK_HOUSEBUILDING_STAGES.filter(
      (s) => !existingCodes.has(s.code)
    );
    setSelectedStageCodes(new Set(available.map((s) => s.code)));
  }

  async function handleAddStage() {
    if (selectedStageCodes.size === 0) return;
    setSavingStage(true);
    try {
      if (selectedStageCodes.has(CUSTOM_STAGE_KEY)) {
        if (!customStageName.trim() || !customStageCode.trim()) return;
        const maxEndWeek =
          template.jobs.length > 0
            ? Math.max(...template.jobs.map((j) => j.endWeek))
            : 0;
        const totalDuration = customSubJobs.reduce(
          (sum, sj) => sum + sj.duration,
          0
        );
        const startWeek = maxEndWeek + 1;
        const endWeek = startWeek + (totalDuration > 0 ? totalDuration : 1) - 1;

        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: customStageName,
              stageCode: customStageCode,
              sortOrder: template.jobs.length,
              startWeek,
              endWeek,
              durationWeeks: totalDuration || null,
            }),
          }
        );
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to create custom stage"));
          return;
        }
        const stageData = await res.json();

        // Create sub-jobs sequentially
        let subStart = startWeek;
        for (let i = 0; i < customSubJobs.length; i++) {
          const sj = customSubJobs[i];
          const subEnd = subStart + sj.duration - 1;
          const subRes = await fetch(`/api/plot-templates/${template.id}/jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sj.name,
              stageCode: sj.code,
              durationWeeks: sj.duration,
              parentId: stageData.id,
              startWeek: subStart,
              endWeek: subEnd,
              sortOrder: i,
            }),
          });
          if (!subRes.ok) {
            toast.error(await fetchErrorMessage(subRes, `Failed to create sub-job "${sj.name}"`));
            return;
          }
          subStart = subEnd + 1;
        }
      } else {
        // Add all selected predefined stages in one bulk call
        const codes = Array.from(selectedStageCodes);
        const res = await fetch(
          `/api/plot-templates/${template.id}/bulk-stages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stageCodes: codes }),
          }
        );
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to add stages"));
          return;
        }
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
      setStageDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add stage");
    } finally {
      setSavingStage(false);
    }
  }

  // ---------- Job Edit (stages and sub-jobs) ----------

  function openEditJob(job: TemplateJobData) {
    setEditingJob(job);
    setJobName(job.name);
    setJobDescription(job.description ?? "");
    setJobStartWeek(job.startWeek);
    setJobEndWeek(job.endWeek);
    setJobStageCode(job.stageCode ?? "");
    setJobWeatherAffected(job.weatherAffected ?? false);
    setJobWeatherAffectedType(job.weatherAffectedType ?? null);
    setJobContractorId(job.contactId ?? "");
    setJobDurationDays(job.durationDays ?? "");
    setJobDialogOpen(true);
  }

  async function handleSaveJob() {
    if (!jobName.trim()) return;
    setSavingJob(true);
    try {
      if (editingJob) {
        // For sub-jobs, also update durationWeeks
        const isSubJob = !!editingJob.parentId;
        const durationWeeks = jobEndWeek - jobStartWeek + 1;

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
              weatherAffected: jobWeatherAffected,
              weatherAffectedType: jobWeatherAffected ? jobWeatherAffectedType : null,
              contactId: jobContractorId && jobContractorId !== "__none__" ? jobContractorId : null,
              ...(isSubJob && { durationWeeks }),
              // durationDays: send null if field cleared, the number if set.
              // Applies to both leaf stages and sub-jobs — apply-template
              // honours it over durationWeeks at create time.
              durationDays: typeof jobDurationDays === "number" && jobDurationDays > 0 ? jobDurationDays : null,
            }),
          }
        );
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to update job"));
          return;
        }

        // If the edited job has children, recalculate their weeks
        if (editingJob.children && editingJob.children.length > 0) {
          await fetch(
            `/api/plot-templates/${template.id}/jobs/${editingJob.id}/recalculate`,
            { method: "POST" }
          );
        }

        // If the edited job is a sub-job, recalculate the parent to update its span
        if (isSubJob && editingJob.parentId) {
          await fetch(
            `/api/plot-templates/${template.id}/jobs/${editingJob.parentId}/recalculate`,
            { method: "POST" }
          );
        }
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
      setJobDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save job");
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
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to delete job"));
        return;
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
      setDeleteJobDialogOpen(false);
      setDeletingJobId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete job");
    }
  }

  // ---------- Sub-Job CRUD ----------

  function openAddSubJob(stage: TemplateJobData) {
    setSubJobParentId(stage.id);
    setSubJobParentChildren(stage.children?.length ?? 0);
    setSubJobParentStartWeek(stage.startWeek);
    setSubJobParentEndWeek(stage.endWeek);
    setSubJobName("");
    setSubJobCode("");
    setSubJobDuration(1);
    setSubJobContractorId("");
    setSubJobDialogOpen(true);
  }

  async function handleSaveSubJob() {
    if (!subJobName.trim() || !subJobCode.trim() || !subJobParentId) return;
    setSavingSubJob(true);
    try {
      const startWeek = subJobParentEndWeek + 1;
      const isDays = subJobDurationUnit === "days";
      // For days-granularity, keep endWeek === startWeek in the legacy
      // model (occupies one week slot). durationDays overrides at apply.
      const endWeek = isDays ? startWeek : startWeek + subJobDuration - 1;

      const res = await fetch(`/api/plot-templates/${template.id}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subJobName,
          stageCode: subJobCode,
          ...(isDays
            ? { durationDays: subJobDuration, durationWeeks: 1 }
            : { durationWeeks: subJobDuration, durationDays: null }),
          parentId: subJobParentId,
          contactId: subJobContractorId && subJobContractorId !== "__none__" ? subJobContractorId : null,
          startWeek,
          endWeek,
          sortOrder: subJobParentChildren,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to create sub-job"));
        return;
      }

      // Recalculate parent stage
      await fetch(
        `/api/plot-templates/${template.id}/jobs/${subJobParentId}/recalculate`,
        { method: "POST" }
      );

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
      setSubJobDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create sub-job");
    } finally {
      setSavingSubJob(false);
    }
  }

  // ---------- Inline duration save ----------

  async function handleDurationBlur(
    subJob: TemplateJobData,
    parentId: string
  ) {
    const newVal = editingDurations[subJob.id];
    if (newVal === undefined || newVal === subJob.durationWeeks) {
      // No change, clear editing state
      setEditingDurations((prev) => {
        const next = { ...prev };
        delete next[subJob.id];
        return next;
      });
      return;
    }

    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/jobs/${subJob.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationWeeks: newVal }),
        }
      );
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to update duration"));
        return;
      }

      await fetch(
        `/api/plot-templates/${template.id}/jobs/${parentId}/recalculate`,
        { method: "POST" }
      );

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update duration");
    } finally {
      setEditingDurations((prev) => {
        const next = { ...prev };
        delete next[subJob.id];
        return next;
      });
    }
  }

  // ---------- Order CRUD ----------


  // Helper: flatten all jobs into a list for reference job dropdown
  function getAllJobsFlat() {
    const result: Array<{ id: string; label: string; indent: number; startWeek: number; stageCode: string | null }> = [];
    for (const job of template.jobs) {
      result.push({
        id: job.id,
        label: job.name,
        indent: 0,
        startWeek: job.startWeek,
        stageCode: job.stageCode,
      });
      if (job.children) {
        for (const child of job.children) {
          result.push({
            id: child.id,
            label: child.name,
            indent: 1,
            startWeek: child.startWeek,
            stageCode: child.stageCode,
          });
        }
      }
    }
    return result;
  }

  // Helper: compute orderWeekOffset and deliveryWeekOffset from natural language fields
  function computeOffsets(ownerJobStartWeek: number) {
    const allJobs = getAllJobsFlat();
    const refJob = allJobs.find((j) => j.id === anchorRefJobId);
    const refWeek = refJob ? refJob.startWeek : ownerJobStartWeek;

    // Convert amount to weeks
    const amountInWeeks = anchorUnit === "days" ? Math.round(anchorAmount / 7) : anchorAmount;
    const leadInWeeks = leadTimeUnit === "days" ? Math.round(leadTimeAmount / 7) : leadTimeAmount;

    let orderWeek;
    let deliveryWeek;

    if (anchorType === "order") {
      // "Order X weeks before/after [job]"
      orderWeek = anchorDirection === "before" ? refWeek - amountInWeeks : refWeek + amountInWeeks;
      deliveryWeek = orderWeek + leadInWeeks;
    } else {
      // "Arrive X weeks before/after [job]"
      deliveryWeek = anchorDirection === "before" ? refWeek - amountInWeeks : refWeek + amountInWeeks;
      orderWeek = deliveryWeek - leadInWeeks;
    }

    const orderWeekOffset = orderWeek - ownerJobStartWeek;
    const deliveryWeekOffset = deliveryWeek - orderWeek;

    return { orderWeekOffset, deliveryWeekOffset, orderWeek, deliveryWeek };
  }

  function openAddOrder(jobId: string) {
    setEditingOrder(null);
    setOrderJobId(jobId);
    setOrderDescription("");
    setAnchorType("order");
    setAnchorAmount(2);
    setAnchorUnit("weeks");
    setAnchorDirection("before");
    setAnchorRefJobId(jobId);
    setLeadTimeAmount(4);
    setLeadTimeUnit("weeks");
    setOrderSupplierId(null);
    setOrderItems([]);
    setMaterialSuggestions([]);
    setOrderError(null);
    setOrderDialogOpen(true);
  }

  function openEditOrder(jobId: string, order: TemplateOrderData) {
    setEditingOrder(order);
    setOrderJobId(jobId);
    setOrderDescription(order.itemsDescription ?? "");
    // Restore new-style fields or reverse-engineer from legacy offsets
    if (order.anchorType) {
      setAnchorType(order.anchorType as "order" | "arrive");
      setAnchorAmount(order.anchorAmount ?? 2);
      setAnchorUnit((order.anchorUnit as "days" | "weeks") ?? "weeks");
      setAnchorDirection((order.anchorDirection as "before" | "after") ?? "before");
      setAnchorRefJobId(order.anchorJobId ?? jobId);
      setLeadTimeAmount(order.leadTimeAmount ?? 4);
      setLeadTimeUnit((order.leadTimeUnit as "days" | "weeks") ?? "weeks");
    } else {
      // Legacy order: reverse-engineer from offsets
      setAnchorType("order");
      setAnchorAmount(Math.abs(order.orderWeekOffset));
      setAnchorUnit("weeks");
      setAnchorDirection(order.orderWeekOffset <= 0 ? "before" : "after");
      setAnchorRefJobId(jobId);
      setLeadTimeAmount(Math.abs(order.deliveryWeekOffset));
      setLeadTimeUnit("weeks");
    }
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
    setOrderError(null);
    try {
      // Find the owning job to compute offsets relative to its startWeek
      const allJobs = getAllJobsFlat();
      const ownerJob = allJobs.find((j) => j.id === orderJobId);
      const ownerStartWeek = ownerJob ? ownerJob.startWeek : 1;
      const { orderWeekOffset, deliveryWeekOffset } = computeOffsets(ownerStartWeek);

      const payload = {
        itemsDescription: orderDescription || null,
        orderWeekOffset,
        deliveryWeekOffset,
        supplierId: orderSupplierId,
        items: orderItems.filter((item) => item.name.trim()),
        anchorType,
        anchorAmount,
        anchorUnit,
        anchorDirection,
        anchorJobId: anchorRefJobId,
        leadTimeAmount,
        leadTimeUnit,
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
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to update order");
          setOrderError(msg);
          toast.error(msg);
          return;
        }
      } else {
        const res = await fetch(
          `/api/plot-templates/${template.id}/jobs/${orderJobId}/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to create order");
          setOrderError(msg);
          toast.error(msg);
          return;
        }
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
      setOrderDialogOpen(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save order. Please try again.";
      setOrderError(msg);
      toast.error(msg);
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
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to delete order"));
        return;
      }

      const tplRes = await fetch(`/api/plot-templates/${template.id}`, { cache: "no-store" });
      const updated = await tplRes.json();
      onUpdate(updated);
      setDeleteOrderDialogOpen(false);
      setDeletingOrderId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete order");
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

  // ---------- Custom stage sub-job helpers ----------

  function addCustomSubJob() {
    setCustomSubJobs((prev) => [
      ...prev,
      { name: "", code: "", duration: 1 },
    ]);
  }

  function updateCustomSubJob(
    index: number,
    field: string,
    value: string | number
  ) {
    setCustomSubJobs((prev) =>
      prev.map((sj, i) => (i === index ? { ...sj, [field]: value } : sj))
    );
  }

  function removeCustomSubJob(index: number) {
    setCustomSubJobs((prev) => prev.filter((_, i) => i !== index));
  }

  // ---------- Render ----------

  const sourcedPlotsCount = template._count?.sourcedPlots ?? 0;

  /**
   * Recursive sub-job row renderer. Handles 2 levels (direct children),
   * 3 levels (grandchildren under a stage → sub-stage → work item),
   * and deeper if templates get that ornate.
   *
   * - depth=1: direct child of a top-level stage
   * - depth=2+: nested under a sub-job
   *
   * Each depth indents left (via ml- + border-l) so the hierarchy is
   * visually obvious. Orders and the "Add Sub-Job" button are available
   * at every depth so any node can become a parent if Keith needs more
   * granularity later.
   */
  const renderSubJobNode = (child: TemplateJobData, depth: number): React.ReactNode => {
    const durationValue =
      editingDurations[child.id] !== undefined
        ? editingDurations[child.id]
        : (child.durationWeeks ?? 1);
    const isChildExpanded = expandedJobs.has(child.id);
    const hasGrandchildren = !!(child.children && child.children.length > 0);
    return (
      <div key={child.id} className="space-y-0">
        <div
          className={`flex items-center gap-2 rounded-md border bg-white px-3 py-2 ${child.orders.length > 0 ? "cursor-pointer hover:bg-slate-50" : ""}`}
          onClick={() => {
            if (child.orders.length > 0) toggleJobExpand(child.id);
          }}
        >
          <Badge
            variant="secondary"
            className="shrink-0 font-mono text-[10px]"
          >
            {child.stageCode}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-sm">
            {child.name}
            {depth > 1 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                (level {depth + 1})
              </span>
            )}
          </span>
          {child.orders.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Package className="size-3" />
              {child.orders.length}
            </span>
          )}
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <Input
              type="number"
              min={1}
              value={durationValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setEditingDurations((prev) => ({
                  ...prev,
                  [child.id]: val,
                }));
              }}
              onBlur={() => handleDurationBlur(child, child.parentId ?? "")}
              className="h-7 w-16 text-center text-xs"
            />
            <span className="text-xs text-muted-foreground">
              wk
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); openAddSubJob(child); }}
              className="rounded p-1 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
              title={depth === 1 ? "Add a nested sub-job under this one" : `Add a level-${depth + 2} sub-job`}
            >
              <Plus className="size-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); openEditJob(child); }}
              className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-slate-700"
            >
              <Pencil className="size-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeletingJobId(child.id);
                setDeleteJobDialogOpen(true);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
        {/* Recursive: grandchildren render directly beneath this row,
            indented further and with a left rule so the hierarchy reads. */}
        {hasGrandchildren && (
          <div className="ml-4 mt-1 space-y-1.5 border-l-2 border-slate-100 pl-2">
            {child.children!.map((grandchild) => renderSubJobNode(grandchild, depth + 1))}
          </div>
        )}
        {isChildExpanded && child.orders.length > 0 && (
          <div className="ml-8 space-y-1.5 border-l-2 border-slate-200 py-2 pl-3">
            {child.orders.map((order) => (
              <div
                key={order.id}
                className="rounded-lg border bg-white p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">
                        {order.itemsDescription || "Material Order"}
                      </p>
                      {order.supplier && (
                        <Badge variant="outline" className="text-[10px]">
                          {order.supplier.name}
                        </Badge>
                      )}
                    </div>
                    {order.items.length > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {order.items.map((it) => it.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => openEditOrder(child.id, order)}
                      className="rounded p-1 text-muted-foreground hover:bg-slate-100"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingOrderId(order.id);
                        setOrderJobId(child.id);
                        setDeleteOrderDialogOpen(true);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] text-muted-foreground"
              onClick={() => openAddOrder(child.id)}
            >
              <Plus className="size-3" />
              Add Order
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to Templates
        </Button>

        {/* Snapshot-model banner — Keith's rule: templates are for new
            plots only, edits here don't propagate. Banner makes that
            explicit when the template has been used before. */}
        {sourcedPlotsCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium">
                {sourcedPlotsCount} plot{sourcedPlotsCount !== 1 ? "s are" : " is"} using this template
              </p>
              <p className="mt-0.5 text-amber-800">
                Changes here won&apos;t affect {sourcedPlotsCount === 1 ? "that plot" : "those plots"} —
                templates are a snapshot at apply time. Edits only apply to NEW plots created after saving.
              </p>
            </div>
          </div>
        )}

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
          expandedJobIds={expandedJobs}
          onToggleExpand={toggleJobExpand}
          onBarClick={handleBarClick}
        />
      )}

      {/* Jobs List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Jobs</h3>
          <Button size="sm" onClick={openAddStage}>
            <Layers className="size-3.5" />
            Add Stage
          </Button>
        </div>

        {template.jobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No jobs yet. Add your first stage to define the build programme.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {template.jobs.map((job, index) => {
              const isExpanded = expandedJobs.has(job.id);
              const hasChildren =
                job.children && job.children.length > 0;

              // Legacy flat job (no children) - render as before
              if (!hasChildren) {
                return (
                  <Card
                    key={job.id}
                    data-job-id={job.id}
                    draggable
                    onDragStart={() => setDraggedJobId(job.id)}
                    onDragEnd={() => { setDraggedJobId(null); setDragOverJobId(null); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverJobId(job.id); }}
                    onDragLeave={() => setDragOverJobId((id) => (id === job.id ? null : id))}
                    onDrop={(e) => { e.preventDefault(); handleStageDrop(job.id); }}
                    className={`overflow-hidden border-border/50 transition-colors ${
                      draggedJobId === job.id ? "opacity-50" :
                      dragOverJobId === job.id ? "ring-2 ring-blue-400" : ""
                    }`}
                  >
                    <div
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/50"
                      onClick={() => toggleJobExpand(job.id)}
                    >
                      <GripVertical className="hidden size-4 shrink-0 text-muted-foreground/40 sm:block" />
                      {isExpanded ? (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                            {index + 1}.
                          </span>
                          <span className="font-medium">{job.name}</span>
                          {job.stageCode && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono"
                            >
                              {job.stageCode}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                          >
                            Wk {job.startWeek}--{job.endWeek}
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
                        {/* Add Sub-Job — converts this flat job into a stage
                            with a single child. Sits alongside the split
                            button (which is for defining multiple sub-jobs
                            at once). Keith's feedback: the split icon alone
                            wasn't obvious as an "add sub-job" affordance. */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddSubJob(job);
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                          title="Add a sub-job"
                        >
                          <Plus className="size-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openSplitDialog(job);
                          }}
                          className="rounded p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                          title="Split into multiple sub-jobs at once"
                        >
                          <GitBranch className="size-3.5" />
                        </button>
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
                                        {order.itemsDescription ||
                                          "Material Order"}
                                      </p>
                                      {order.supplier && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px]"
                                        >
                                          {order.supplier.name}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                      {order.anchorType ? (
                                        <span>
                                          {order.anchorType === "order" ? "Order" : "Arrive"}{" "}
                                          {order.anchorAmount} {order.anchorUnit}{" "}
                                          {order.anchorDirection}{" "}
                                          {order.anchorJob ? order.anchorJob.name : "job start"}
                                          {order.leadTimeAmount != null && order.leadTimeAmount > 0 && (
                                            <>{", lead: "}{order.leadTimeAmount} {order.leadTimeUnit}</>
                                          )}
                                        </span>
                                      ) : (
                                        <>
                                          <span>
                                            Order:{" "}
                                            {order.orderWeekOffset >= 0 ? "+" : ""}
                                            {order.orderWeekOffset}w from job start
                                          </span>
                                          <span>
                                            Delivery:{" "}
                                            {order.deliveryWeekOffset >= 0 ? "+" : ""}
                                            {order.deliveryWeekOffset}w from order
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    {order.items.length > 0 && (
                                      <div className="mt-2 space-y-0.5">
                                        {order.items.map((item) => (
                                          <div
                                            key={item.id}
                                            className="text-xs text-muted-foreground"
                                          >
                                            {item.quantity} {item.unit}{" "}
                                            &times; {item.name}
                                            {item.unitCost > 0 &&
                                              ` @ \u00A3${item.unitCost.toFixed(2)}`}
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
              }

              // Stage with children (hierarchical)
              return (
                <Card
                  key={job.id}
                  data-job-id={job.id}
                  draggable
                  onDragStart={() => setDraggedJobId(job.id)}
                  onDragEnd={() => { setDraggedJobId(null); setDragOverJobId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverJobId(job.id); }}
                  onDragLeave={() => setDragOverJobId((id) => (id === job.id ? null : id))}
                  onDrop={(e) => { e.preventDefault(); handleStageDrop(job.id); }}
                  className={`overflow-hidden border-border/50 transition-colors ${
                    draggedJobId === job.id ? "opacity-50" :
                    dragOverJobId === job.id ? "ring-2 ring-blue-400" : ""
                  }`}
                >
                  {/* Stage header row */}
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/50"
                    onClick={() => toggleJobExpand(job.id)}
                  >
                    <GripVertical className="hidden size-4 shrink-0 text-muted-foreground/40 sm:block" />
                    {isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Layers className="size-4 shrink-0 text-blue-500" />
                        <span className="font-semibold">
                          <span className="hidden sm:inline">Stage: </span>{job.name}
                        </span>
                        {job.stageCode && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            {job.stageCode}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                        >
                          Wk {job.startWeek}--{job.endWeek}
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

                  {/* Expanded: Sub-jobs + Orders */}
                  {isExpanded && (
                    <div className="border-t bg-slate-50/30 px-4 py-3">
                      <div className="ml-9 space-y-3">
                        {/* Sub-jobs section */}
                        <div className="space-y-1.5">
                          {job.children.map((child) => renderSubJobNode(child, 1))}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => openAddSubJob(job)}
                          >
                            <Plus className="size-3" />
                            Add Sub-Job
                          </Button>
                        </div>

                        {/* Orders section */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground uppercase">
                              Stage-Level Orders
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
                            (() => {
                              const childOrderCount = job.children.reduce((sum, c) => sum + c.orders.length, 0);
                              return childOrderCount > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  {childOrderCount} order{childOrderCount !== 1 ? "s" : ""} on sub-jobs above. Click a sub-job to view.
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No orders for this stage.
                                </p>
                              );
                            })()
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
                                        {order.itemsDescription ||
                                          "Material Order"}
                                      </p>
                                      {order.supplier && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px]"
                                        >
                                          {order.supplier.name}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                      {order.anchorType ? (
                                        <span>
                                          {order.anchorType === "order" ? "Order" : "Arrive"}{" "}
                                          {order.anchorAmount} {order.anchorUnit}{" "}
                                          {order.anchorDirection}{" "}
                                          {order.anchorJob ? order.anchorJob.name : "job start"}
                                          {order.leadTimeAmount != null && order.leadTimeAmount > 0 && (
                                            <>{", lead: "}{order.leadTimeAmount} {order.leadTimeUnit}</>
                                          )}
                                        </span>
                                      ) : (
                                        <>
                                          <span>
                                            Order:{" "}
                                            {order.orderWeekOffset >= 0 ? "+" : ""}
                                            {order.orderWeekOffset}w from job start
                                          </span>
                                          <span>
                                            Delivery:{" "}
                                            {order.deliveryWeekOffset >= 0 ? "+" : ""}
                                            {order.deliveryWeekOffset}w from order
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    {order.items.length > 0 && (
                                      <div className="mt-2 space-y-0.5">
                                        {order.items.map((item) => (
                                          <div
                                            key={item.id}
                                            className="text-xs text-muted-foreground"
                                          >
                                            {item.quantity} {item.unit}{" "}
                                            &times; {item.name}
                                            {item.unitCost > 0 &&
                                              ` @ \u00A3${item.unitCost.toFixed(2)}`}
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
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Stage Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Stages</DialogTitle>
            <DialogDescription>
              Select one or more predefined stages, or create a custom one.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
            {/* Select All button */}
            {(() => {
              const existingCodes = new Set(
                template.jobs.filter((j) => !j.parentId).map((j) => j.stageCode)
              );
              const availableCount = UK_HOUSEBUILDING_STAGES.filter(
                (s) => !existingCodes.has(s.code)
              ).length;
              return availableCount > 1 ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedStageCodes.size > 0 && !selectedStageCodes.has(CUSTOM_STAGE_KEY)
                      ? `${selectedStageCodes.size} selected`
                      : ""}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={selectAllStages}
                  >
                    Select All ({availableCount})
                  </Button>
                </div>
              ) : null;
            })()}

            {/* Predefined stages grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {UK_HOUSEBUILDING_STAGES.map((stage) => {
                const totalWeeks = getStageTotalWeeks(stage);
                const isSelected = selectedStageCodes.has(stage.code);
                const alreadyAdded = template.jobs
                  .filter((j) => !j.parentId)
                  .some((j) => j.stageCode === stage.code);
                return (
                  <button
                    key={stage.code}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => toggleStageCode(stage.code)}
                    className={`relative rounded-lg border p-3 text-left transition-colors ${
                      alreadyAdded
                        ? "cursor-not-allowed border-green-200 bg-green-50/50 opacity-60"
                        : isSelected
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                          : "border-border hover:border-blue-300 hover:bg-slate-50"
                    }`}
                  >
                    {alreadyAdded ? (
                      <div className="absolute right-2 top-2">
                        <Check className="size-4 text-green-600" />
                      </div>
                    ) : isSelected ? (
                      <div className="absolute right-2 top-2">
                        <Check className="size-4 text-blue-600" />
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px]"
                      >
                        {stage.code}
                      </Badge>
                      <span className="text-sm font-medium">
                        {stage.name}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>
                        {stage.subJobs.length} sub-job
                        {stage.subJobs.length !== 1 ? "s" : ""}
                      </span>
                      <span>{totalWeeks} wk total</span>
                      {alreadyAdded && <span className="text-green-600">Added</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom stage option */}
            <button
              type="button"
              onClick={() => toggleStageCode(CUSTOM_STAGE_KEY)}
              className={`w-full rounded-lg border border-dashed p-3 text-left transition-colors ${
                selectedStageCodes.has(CUSTOM_STAGE_KEY)
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-border hover:border-blue-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <Plus className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Custom Stage</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Define your own stage name, code, and sub-jobs.
              </p>
            </button>

            {/* Custom stage form */}
            {selectedStageCodes.has(CUSTOM_STAGE_KEY) && (
              <div className="space-y-3 rounded-lg border bg-slate-50/50 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Stage Name</Label>
                    <Input
                      placeholder="e.g. Scaffolding"
                      value={customStageName}
                      onChange={(e) => setCustomStageName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Stage Code</Label>
                    <Input
                      placeholder="e.g. SCF"
                      value={customStageCode}
                      onChange={(e) =>
                        setCustomStageCode(
                          e.target.value.toUpperCase().slice(0, 4)
                        )
                      }
                      maxLength={4}
                      className="w-28 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Sub-Jobs</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={addCustomSubJob}
                    >
                      <Plus className="size-3" />
                      Add Sub-Job
                    </Button>
                  </div>
                  {customSubJobs.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_80px_70px_28px] gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <span>Name</span>
                        <span>Code</span>
                        <span>Weeks</span>
                        <span />
                      </div>
                      {customSubJobs.map((sj, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-[1fr_80px_70px_28px] gap-1.5"
                        >
                          <Input
                            placeholder="Sub-job name"
                            value={sj.name}
                            onChange={(e) =>
                              updateCustomSubJob(
                                idx,
                                "name",
                                e.target.value
                              )
                            }
                            className="h-8 text-xs"
                          />
                          <Input
                            placeholder="Code"
                            value={sj.code}
                            onChange={(e) =>
                              updateCustomSubJob(
                                idx,
                                "code",
                                e.target.value
                                  .toUpperCase()
                                  .slice(0, 4)
                              )
                            }
                            maxLength={4}
                            className="h-8 font-mono text-xs"
                          />
                          <Input
                            type="number"
                            min={1}
                            value={sj.duration}
                            onChange={(e) =>
                              updateCustomSubJob(
                                idx,
                                "duration",
                                parseInt(e.target.value) || 1
                              )
                            }
                            className="h-8 text-xs"
                          />
                          <button
                            onClick={() => removeCustomSubJob(idx)}
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
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleAddStage}
              disabled={
                savingStage ||
                selectedStageCodes.size === 0 ||
                (selectedStageCodes.has(CUSTOM_STAGE_KEY) &&
                  (!customStageName.trim() || !customStageCode.trim()))
              }
            >
              {savingStage ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Adding{selectedStageCodes.size > 1 ? ` (${selectedStageCodes.size})` : ""}...
                </>
              ) : (
                <>
                  <Layers className="size-3.5" />
                  Add {selectedStageCodes.size > 1 ? `${selectedStageCodes.size} Stages` : "Stage"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Sub-Job Dialog */}
      <Dialog open={subJobDialogOpen} onOpenChange={setSubJobDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Sub-Job</DialogTitle>
            <DialogDescription>
              Add a new sub-job to this stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Foundations"
                value={subJobName}
                onChange={(e) => setSubJobName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                placeholder="e.g. FND"
                value={subJobCode}
                onChange={(e) =>
                  setSubJobCode(e.target.value.toUpperCase().slice(0, 4))
                }
                maxLength={4}
                className="w-28 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Max 4 characters, auto-uppercase.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={subJobDuration}
                  onChange={(e) => setSubJobDuration(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
                <div className="inline-flex rounded-md border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSubJobDurationUnit("weeks")}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      subJobDurationUnit === "weeks"
                        ? "bg-slate-900 text-white"
                        : "text-muted-foreground hover:bg-slate-50"
                    }`}
                  >
                    Weeks
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubJobDurationUnit("days")}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      subJobDurationUnit === "days"
                        ? "bg-slate-900 text-white"
                        : "text-muted-foreground hover:bg-slate-50"
                    }`}
                  >
                    Days
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {subJobDurationUnit === "days"
                  ? `${subJobDuration} working day${subJobDuration !== 1 ? "s" : ""} — spans less than a week.`
                  : `${subJobDuration} week${subJobDuration !== 1 ? "s" : ""} (${subJobDuration * 5} working days).`}
              </p>
            </div>
            {contractors.length > 0 && (
              <div className="space-y-2">
                <Label>Contractor</Label>
                <Select value={subJobContractorId} onValueChange={(v) => setSubJobContractorId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    {/* Explicit label resolution — some Base UI builds fall
                        back to the raw value (ID) when SelectValue is empty.
                        Keith flagged this as "showing IDs not names". */}
                    <SelectValue placeholder="No contractor assigned">
                      {subJobContractorId && subJobContractorId !== "__none__"
                        ? (() => {
                            const c = contractors.find((c) => c.id === subJobContractorId);
                            return c ? (c.company ? `${c.company} (${c.name})` : c.name) : "Loading...";
                          })()
                        : subJobContractorId === "__none__" ? "No contractor" : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No contractor</SelectItem>
                    {contractors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company ? `${c.company} (${c.name})` : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleSaveSubJob}
              disabled={
                savingSubJob ||
                !subJobName.trim() ||
                !subJobCode.trim()
              }
            >
              {savingSubJob ? "Saving..." : "Add Sub-Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Edit Dialog (stages and sub-jobs) */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingJob
                ? editingJob.parentId
                  ? "Edit Sub-Job"
                  : "Edit Stage"
                : "Edit Job"}
            </DialogTitle>
            <DialogDescription>
              {editingJob
                ? editingJob.parentId
                  ? "Update this sub-job."
                  : "Update this stage."
                : "Update this template job."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
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
            <div className="space-y-2">
              <Label>Weather Impact</Label>
              <p className="text-[11px] text-muted-foreground">Weather impact days will be logged against this job if affected</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: null,          label: "None",        bg: "bg-slate-100 text-slate-600 border-slate-200" },
                  { value: "RAIN",        label: "☔ Rain",     bg: "bg-blue-50 text-blue-700 border-blue-200" },
                  { value: "TEMPERATURE", label: "🌡️ Temperature", bg: "bg-cyan-50 text-cyan-700 border-cyan-200" },
                  { value: "BOTH",        label: "Both",        bg: "bg-amber-50 text-amber-700 border-amber-200" },
                ] as const).map(({ value, label, bg }) => {
                  const selected = jobWeatherAffected
                    ? (jobWeatherAffectedType === value)
                    : value === null;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={() => {
                        if (value === null) {
                          setJobWeatherAffected(false);
                          setJobWeatherAffectedType(null);
                        } else {
                          setJobWeatherAffected(true);
                          setJobWeatherAffectedType(value);
                        }
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${bg} ${selected ? "ring-2 ring-offset-1 ring-blue-400" : "opacity-60 hover:opacity-100"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {contractors.length > 0 && (
              <div className="space-y-2">
                <Label>Contractor</Label>
                <Select value={jobContractorId} onValueChange={(v) => setJobContractorId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No contractor assigned">
                      {jobContractorId && jobContractorId !== "__none__"
                        ? (() => {
                            const c = contractors.find((c) => c.id === jobContractorId);
                            return c ? (c.company ? `${c.company} (${c.name})` : c.name) : "Loading...";
                          })()
                        : jobContractorId === "__none__" ? "No contractor" : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No contractor</SelectItem>
                    {contractors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company ? `${c.company} (${c.name})` : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            {/* Days-granularity override — applies to both stages and sub-jobs.
                When set, takes precedence over the week range at apply time.
                Blank = use weeks, any positive number = use that many working days. */}
            <div className="space-y-2">
              <Label>Duration in days (optional)</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={jobDurationDays}
                onChange={(e) => {
                  const v = e.target.value;
                  setJobDurationDays(v === "" ? "" : (parseInt(v) || ""));
                }}
                placeholder="Leave blank for weeks"
                className="w-40"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to use the Start / End Week above. Set a number
                for sub-week jobs (e.g. 3 for a 3-day paint touch-up).
              </p>
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
                  ? editingJob.parentId
                    ? "Update Sub-Job"
                    : "Update Stage"
                  : "Update Job"}
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
                      ? suppliers.find((s) => s.id === orderSupplierId)
                          ?.name ?? "Loading..."
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
            {/* Timing: natural language row */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label>Timing</Label>
                <HelpTip title="About order timing anchors" anchor="below-right">
                  <p><strong>What this does:</strong> ties the order to a job&apos;s start so the dates stay correct when the programme shifts. No fixed calendar dates — the order moves with the job.</p>
                  <p><strong>&quot;Order&quot; vs &quot;Arrive&quot;:</strong> <em>Order</em> = when you place the order with the supplier. <em>Arrive</em> = when materials land on site. The other date is worked out from the supplier&apos;s lead time.</p>
                  <p><strong>Example:</strong> &quot;Order 2 weeks before Brickwork first lift&quot; means if brickwork shifts a week, the order date also shifts a week. Same relationship kept.</p>
                  <p><strong>Which job to pick:</strong> the job this material is for. Concrete → foundations. Bricks → brickwork. Roof tiles → roofing.</p>
                </HelpTip>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={anchorType} onValueChange={(v) => setAnchorType(v as "order" | "arrive")}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Order</SelectItem>
                    <SelectItem value="arrive">Arrive</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  min={0}
                  className="w-[70px]"
                  value={anchorAmount}
                  onChange={(e) => setAnchorAmount(parseInt(e.target.value) || 0)}
                />

                <Select value={anchorUnit} onValueChange={(v) => setAnchorUnit(v as "days" | "weeks")}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={anchorDirection} onValueChange={(v) => setAnchorDirection(v as "before" | "after")}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">Before</SelectItem>
                    <SelectItem value="after">After</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={anchorRefJobId ?? ""} onValueChange={(v) => setAnchorRefJobId(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select job...">
                      {anchorRefJobId ? (getAllJobsFlat().find((j) => j.id === anchorRefJobId)?.label ?? "Select job...") : "Select job..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {getAllJobsFlat().map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.indent > 0 ? "\u00A0\u00A0\u00A0\u00A0" : ""}{j.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lead time */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Lead time:</span>
                <Input
                  type="number"
                  min={0}
                  className="w-[70px]"
                  value={leadTimeAmount}
                  onChange={(e) => setLeadTimeAmount(parseInt(e.target.value) || 0)}
                />
                <Select value={leadTimeUnit} onValueChange={(v) => setLeadTimeUnit(v as "days" | "weeks")}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              {(() => {
                const allJobs = getAllJobsFlat();
                const ownerJob = allJobs.find((j) => j.id === orderJobId);
                const ownerStartWeek = ownerJob ? ownerJob.startWeek : 1;
                const { orderWeek, deliveryWeek } = computeOffsets(ownerStartWeek);
                const refJob = allJobs.find((j) => j.id === anchorRefJobId);
                return (
                  <p className="text-xs italic text-muted-foreground">
                    {anchorType === "order" ? "Order" : "Arrive"}{" "}
                    {anchorAmount} {anchorUnit} {anchorDirection}{" "}
                    {refJob ? refJob.label : "job start"}
                    {" → "}Order Wk {orderWeek} {"→"} Delivery Wk {deliveryWeek}
                  </p>
                );
              })()}
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
                          item.name.toLowerCase() ===
                          m.name.toLowerCase()
                      );
                      return (
                        <button
                          key={m.name}
                          type="button"
                          onClick={() =>
                            !isAdded && addMaterialToOrder(m)
                          }
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
                              {"\u00A3"}
                              {m.unitCost.toFixed(2)}/{m.unit}
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
          {orderError && (
            <p className="text-sm text-red-600 px-6 pb-2">{orderError}</p>
          )}
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

      {/* Split Job into Sub-Jobs Dialog */}
      <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <HelpTip title="About splitting jobs" anchor="below-left">
            <p><strong>What this does:</strong> converts a single job (e.g. &quot;Brickwork&quot;) into a <em>stage</em> with named sub-jobs (e.g. &quot;Brickwork to DPC&quot;, &quot;Ground Floor Blockwork&quot;). Each sub-job is individually scheduled and started.</p>
            <p><strong>Order placement:</strong> if the original job had orders attached, you&apos;ll be asked which sub-job should own them. Orders can&apos;t float — they need exactly one job.</p>
            <p><strong>Dates:</strong> sub-jobs inherit the parent&apos;s date range by default; you can edit them afterwards. The stage&apos;s overall start/end is always the min/max of its children.</p>
            <p><strong>Irreversible:</strong> once split, un-splitting isn&apos;t a one-click undo — you&apos;d manually delete sub-jobs and re-add order links.</p>
          </HelpTip>
          <DialogHeader>
            <DialogTitle>Split into Sub-Jobs</DialogTitle>
            <DialogDescription>
              Convert &ldquo;{splitJobName}&rdquo; into a stage with sub-jobs.
              Each sub-job will become an individual job in the programme.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {splitSubJobs.map((sj, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border p-2"
              >
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder="Sub-job name"
                    value={sj.name}
                    onChange={(e) => {
                      const next = [...splitSubJobs];
                      next[i] = { ...next[i], name: e.target.value };
                      setSplitSubJobs(next);
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-20">
                  <Input
                    placeholder="Code"
                    value={sj.code}
                    maxLength={4}
                    onChange={(e) => {
                      const next = [...splitSubJobs];
                      next[i] = {
                        ...next[i],
                        code: e.target.value.toUpperCase(),
                      };
                      setSplitSubJobs(next);
                    }}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    value={sj.duration}
                    onChange={(e) => {
                      const next = [...splitSubJobs];
                      next[i] = {
                        ...next[i],
                        duration: parseInt(e.target.value) || 1,
                      };
                      setSplitSubJobs(next);
                    }}
                    className="h-8 w-16 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">wk</span>
                </div>
                <button
                  onClick={() => {
                    setSplitSubJobs(splitSubJobs.filter((_, j) => j !== i));
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  disabled={splitSubJobs.length <= 1}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setSplitSubJobs([
                  ...splitSubJobs,
                  { name: "", code: "", duration: 1 },
                ])
              }
            >
              <Plus className="size-3" />
              Add Sub-Job
            </Button>

            {/* Orders placement picker — only shown when the job being
                split has existing orders. Keith's rule (Q5 Apr 2026):
                orders never become orphaned. Default keeps them on the
                new parent stage; user can redirect to a specific sub-job. */}
            {splitOrderCount > 0 && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <Label className="text-xs font-medium">
                  This job has {splitOrderCount} order{splitOrderCount !== 1 ? "s" : ""}. Where should {splitOrderCount === 1 ? "it" : "they"} go?
                </Label>
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="split-order-target"
                      value="keep"
                      checked={splitOrderTarget === "keep"}
                      onChange={(e) => setSplitOrderTarget(e.target.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Keep on the stage</span>
                      <span className="block text-muted-foreground text-[11px]">Orders belong to the stage as a whole (e.g. &quot;bricks for the whole stage&quot;).</span>
                    </span>
                  </label>
                  {splitSubJobs.map((sj, i) => (
                    <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="split-order-target"
                        value={`index:${i}`}
                        checked={splitOrderTarget === `index:${i}`}
                        onChange={(e) => setSplitOrderTarget(e.target.value)}
                        className="mt-0.5"
                        disabled={!sj.name.trim()}
                      />
                      <span>
                        <span className="font-medium">Move to: {sj.name.trim() || <em className="text-muted-foreground">unnamed sub-job</em>}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleSplit}
              disabled={
                savingSplit ||
                splitSubJobs.length === 0 ||
                splitSubJobs.some((sj) => !sj.name.trim())
              }
            >
              {savingSplit && <Loader2 className="size-4 animate-spin" />}
              <GitBranch className="size-4" />
              Split Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
