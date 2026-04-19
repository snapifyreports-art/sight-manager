"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Briefcase,
  Plus,
  MoreHorizontal,
  Play,
  Pause,
  CheckCircle,
  Pencil,
  Eye,
  Trash2,
  CircleDot,
  Clock,
  Loader2,
  HardHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useJobAction } from "@/hooks/useJobAction";
import { useDelayJob } from "@/hooks/useDelayJob";

// ---------- Types ----------

interface Workflow {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
}

interface JobRow {
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
  workflow: Workflow & { createdAt: string; updatedAt: string; description: string | null; status: string; createdById: string };
  assignedTo: (User & { createdAt: string; updatedAt: string; email: string; password: string; role: string; jobTitle: string | null; company: string | null; phone: string | null; avatar: string | null }) | null;
  contractors?: Array<{ contact: { id: string; name: string; company: string | null } | null }>;
  _count: { orders: number };
}

interface JobsClientProps {
  initialJobs: JobRow[];
  workflows: Workflow[];
  users: User[];
}

// ---------- Status Config ----------

const STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; dotColor: string }
> = {
  NOT_STARTED: {
    label: "Not Started",
    bgColor: "bg-slate-400/10",
    dotColor: "text-slate-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    bgColor: "bg-amber-500/10",
    dotColor: "text-amber-500",
  },
  ON_HOLD: {
    label: "On Hold",
    bgColor: "bg-red-500/10",
    dotColor: "text-red-500",
  },
  COMPLETED: {
    label: "Completed",
    bgColor: "bg-green-500/10",
    dotColor: "text-green-500",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_STARTED;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor}`}
    >
      <CircleDot className={`size-2.5 ${config.dotColor}`} />
      <span>{config.label}</span>
    </div>
  );
}

// ---------- Create/Edit Form ----------

interface JobFormData {
  name: string;
  description: string;
  workflowId: string;
  assignedToId: string;
  location: string;
  address: string;
  siteName: string;
  plot: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: JobFormData = {
  name: "",
  description: "",
  workflowId: "",
  assignedToId: "",
  location: "",
  address: "",
  siteName: "",
  plot: "",
  startDate: "",
  endDate: "",
};

// ---------- Main Component ----------

export function JobsClient({ initialJobs, workflows, users }: JobsClientProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [workflowFilter, setWorkflowFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobRow | null>(null);
  const [form, setForm] = useState<JobFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Filtered jobs
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (workflowFilter !== "all" && job.workflowId !== workflowFilter)
      return false;
    return true;
  });

  const updateField = useCallback(
    (field: keyof JobFormData, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Create job
  async function handleCreate() {
    if (!form.name || !form.workflowId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          workflowId: form.workflowId,
          assignedToId: form.assignedToId || null,
          location: form.location || null,
          address: form.address || null,
          siteName: form.siteName || null,
          plot: form.plot || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });
      if (res.ok) {
        const newJob = await res.json();
        setJobs((prev) => [newJob, ...prev]);
        setCreateOpen(false);
        setForm(EMPTY_FORM);
      }
    } finally {
      setSaving(false);
    }
  }

  // Edit job
  function openEdit(job: JobRow) {
    setEditingJob(job);
    setForm({
      name: job.name,
      description: job.description || "",
      workflowId: job.workflowId,
      assignedToId: job.assignedToId || "",
      location: job.location || "",
      address: job.address || "",
      siteName: job.siteName || "",
      plot: job.plot || "",
      startDate: job.startDate ? job.startDate.split("T")[0] : "",
      endDate: job.endDate ? job.endDate.split("T")[0] : "",
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editingJob || !form.name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${editingJob.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          workflowId: form.workflowId,
          assignedToId: form.assignedToId || null,
          location: form.location || null,
          address: form.address || null,
          siteName: form.siteName || null,
          plot: form.plot || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setJobs((prev) =>
          prev.map((j) => (j.id === updated.id ? updated : j))
        );
        setEditOpen(false);
        setEditingJob(null);
        setForm(EMPTY_FORM);
      }
    } finally {
      setSaving(false);
    }
  }

  // Centralised pre-start flow (predecessor + order + early/late dialogs)
  const { triggerAction: triggerJobAction, runSimpleAction, dialogs: jobActionDialogs } = useJobAction(
    (_action, _jobId) => { router.refresh(); }
  );

  // Centralised delay flow — both input modes + weather auto-suggestion all
  // live in useDelayJob (same dialog used by Daily Brief / Walkthrough / Tasks).
  const { openDelayDialog: openDelayJobDialog, dialogs: delayDialogs } = useDelayJob(
    () => { router.refresh(); }
  );

  // Job actions (start, stop, complete). Start routes through useJobAction so
  // users see the pre-start dialogs; stop/complete use runSimpleAction.
  async function handleAction(jobId: string, action: string) {
    if (action === "start") {
      const j = jobs.find((x) => x.id === jobId);
      if (!j) return;
      await triggerJobAction(
        {
          id: j.id,
          name: j.name,
          status: j.status,
          startDate: j.startDate,
          endDate: j.endDate,
        },
        "start"
      );
      return;
    }
    const res = await runSimpleAction(jobId, action as "stop" | "complete" | "signoff" | "note");
    if (res.ok) {
      const updated = res.data as JobRow | undefined;
      if (updated?.id) {
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      }
    }
  }

  // Delete job
  async function handleDelete(jobId: string) {
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (res.ok) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    }
  }

  return (
    <div className="space-y-6">
      {jobActionDialogs}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
            <p className="text-sm text-muted-foreground">
              Manage and track all construction jobs
            </p>
          </div>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
          <Plus className="size-4" data-icon="inline-start" />
          New Job
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => v !== null && setStatusFilter(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="NOT_STARTED">Not Started</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={workflowFilter} onValueChange={(v) => v !== null && setWorkflowFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Workflows" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Workflows</SelectItem>
            {workflows.map((wf) => (
              <SelectItem key={wf.id} value={wf.id}>
                {wf.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {filteredJobs.length} job{filteredJobs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Briefcase className="size-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No jobs found</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}
          >
            <Plus className="size-3.5" data-icon="inline-start" />
            Create your first job
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Site / Plot</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead className="text-center">Orders</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.map((job) => (
              <TableRow
                key={job.id}
                className="cursor-pointer"
                onClick={() => router.push(`/jobs/${job.id}`)}
              >
                <TableCell className="font-medium">{job.name}</TableCell>
                <TableCell>{job.workflow.name}</TableCell>
                <TableCell>
                  <StatusBadge status={job.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {job.assignedTo?.name ?? "\u2014"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {job.contractors && job.contractors.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <HardHat className="size-3 shrink-0" />
                      {job.contractors
                        .map((jc) => jc.contact?.company || jc.contact?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  ) : "\u2014"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {[job.siteName, job.plot ? `Plot ${job.plot}` : null]
                    .filter(Boolean)
                    .join(" \u2022 ") || "\u2014"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {job.startDate
                    ? format(new Date(job.startDate), "dd MMM yyyy")
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-center">
                  {job._count.orders > 0 ? (
                    <Badge variant="secondary">{job._count.orders}</Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {job.status !== "IN_PROGRESS" && job.status !== "COMPLETED" && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(job.id, "start");
                          }}
                        >
                          <Play className="size-4 text-amber-500" />
                          Start Job
                        </DropdownMenuItem>
                      )}
                      {job.status === "IN_PROGRESS" && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(job.id, "stop");
                          }}
                        >
                          <Pause className="size-4 text-red-500" />
                          Stop Job
                        </DropdownMenuItem>
                      )}
                      {job.status !== "COMPLETED" && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(job.id, "complete");
                          }}
                        >
                          <CheckCircle className="size-4 text-green-500" />
                          Complete Job
                        </DropdownMenuItem>
                      )}
                      {job.status !== "COMPLETED" && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openDelayJobDialog({
                              id: job.id,
                              name: job.name,
                              startDate: job.startDate,
                              endDate: job.endDate,
                            });
                          }}
                        >
                          <Clock className="size-4 text-amber-500" />
                          Delay Job
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/jobs/${job.id}`);
                        }}
                      >
                        <Eye className="size-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(job);
                        }}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(job.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Job</DialogTitle>
            <DialogDescription>
              Add a new job to a workflow. Name and workflow are required.
            </DialogDescription>
          </DialogHeader>
          <JobForm
            form={form}
            updateField={updateField}
            workflows={workflows}
            users={users}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.name || !form.workflowId}
            >
              {saving ? "Creating..." : "Create Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingJob(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
            <DialogDescription>
              Update the job details below.
            </DialogDescription>
          </DialogHeader>
          <JobForm
            form={form}
            updateField={updateField}
            workflows={workflows}
            users={users}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={saving || !form.name}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delay Dialog — delegated to useDelayJob hook */}
      {delayDialogs}
    </div>
  );
}

// ---------- Shared Form ----------

function JobForm({
  form,
  updateField,
  workflows,
  users,
}: {
  form: JobFormData;
  updateField: (field: keyof JobFormData, value: string) => void;
  workflows: Workflow[];
  users: User[];
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="job-name">Name *</Label>
        <Input
          id="job-name"
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="e.g. First Fix Electrical"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="job-description">Description</Label>
        <Textarea
          id="job-description"
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Optional description..."
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Workflow *</Label>
          <Select
            value={form.workflowId}
            onValueChange={(val) => val !== null && updateField("workflowId", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select workflow" />
            </SelectTrigger>
            <SelectContent>
              {workflows.map((wf) => (
                <SelectItem key={wf.id} value={wf.id}>
                  {wf.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Assigned To</Label>
          <Select
            value={form.assignedToId || "unassigned"}
            onValueChange={(val) => {
              if (val !== null) updateField("assignedToId", val === "unassigned" ? "" : val);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="job-site">Site Name</Label>
          <Input
            id="job-site"
            value={form.siteName}
            onChange={(e) => updateField("siteName", e.target.value)}
            placeholder="e.g. Riverside Phase 2"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="job-plot">Plot</Label>
          <Input
            id="job-plot"
            value={form.plot}
            onChange={(e) => updateField("plot", e.target.value)}
            placeholder="e.g. 14A"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="job-location">Location</Label>
        <Input
          id="job-location"
          value={form.location}
          onChange={(e) => updateField("location", e.target.value)}
          placeholder="e.g. Block C, Ground Floor"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="job-address">Address</Label>
        <Input
          id="job-address"
          value={form.address}
          onChange={(e) => updateField("address", e.target.value)}
          placeholder="Full address"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="job-start">Start Date</Label>
          <Input
            id="job-start"
            type="date"
            value={form.startDate}
            onChange={(e) => updateField("startDate", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="job-end">End Date</Label>
          <Input
            id="job-end"
            type="date"
            value={form.endDate}
            onChange={(e) => updateField("endDate", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
