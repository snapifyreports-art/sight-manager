"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Plus,
  Pencil,
  CircleDot,
  Briefcase,
  Calendar,
  MapPin,
  User,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

// ---------- Types ----------

interface JobItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  siteName: string | null;
  plot: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
}

interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  _count: { jobs: number };
  jobs: JobItem[];
}

// ---------- Helpers ----------

const WORKFLOW_STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
    dotColor: string;
  }
> = {
  active: {
    label: "Active",
    variant: "default",
    dotColor: "text-green-500",
  },
  completed: {
    label: "Completed",
    variant: "secondary",
    dotColor: "text-blue-500",
  },
  paused: {
    label: "Paused",
    variant: "outline",
    dotColor: "text-amber-500",
  },
};

const JOB_STATUS_CONFIG: Record<
  string,
  {
    label: string;
    borderColor: string;
    bgColor: string;
    dotColor: string;
  }
> = {
  COMPLETED: {
    label: "Completed",
    borderColor: "border-l-green-500",
    bgColor: "bg-green-500/10",
    dotColor: "text-green-500",
  },
  IN_PROGRESS: {
    label: "In Progress",
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-500/10",
    dotColor: "text-amber-500",
  },
  ON_HOLD: {
    label: "On Hold",
    borderColor: "border-l-red-500",
    bgColor: "bg-red-500/10",
    dotColor: "text-red-500",
  },
  NOT_STARTED: {
    label: "Not Started",
    borderColor: "border-l-slate-400",
    bgColor: "bg-slate-400/10",
    dotColor: "text-slate-400",
  },
};

function getWorkflowStatusConfig(status: string) {
  return WORKFLOW_STATUS_CONFIG[status] ?? WORKFLOW_STATUS_CONFIG.active;
}

function getJobStatusConfig(status: string) {
  return JOB_STATUS_CONFIG[status] ?? JOB_STATUS_CONFIG.NOT_STARTED;
}

// ---------- Programme Timeline ----------

function ProgrammeTimeline({ jobs }: { jobs: JobItem[] }) {
  if (jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Programme Overview</CardTitle>
        <CardDescription>
          Visual timeline of jobs in this workflow
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[15px] top-0 h-full w-0.5 bg-border" />

          <div className="space-y-4">
            {jobs.map((job, index) => {
              const config = getJobStatusConfig(job.status);
              return (
                <div key={job.id} className="relative flex items-start gap-4 pl-1">
                  {/* Status dot */}
                  <div
                    className={`relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full ring-4 ring-background ${config.bgColor}`}
                  >
                    <CircleDot className={`size-4 ${config.dotColor}`} />
                  </div>

                  {/* Job info */}
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {index + 1}.
                      </span>
                      <span className="truncate font-medium">{job.name}</span>
                      <Badge
                        variant={
                          job.status === "COMPLETED"
                            ? "default"
                            : job.status === "ON_HOLD"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {config.label}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {job.assignedTo && (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {job.assignedTo.name}
                        </span>
                      )}
                      {job.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {format(new Date(job.startDate), "d MMM")}
                          {job.endDate &&
                            ` - ${format(new Date(job.endDate), "d MMM")}`}
                        </span>
                      )}
                      {job.siteName && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {job.siteName}
                          {job.plot && ` / Plot ${job.plot}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Job Cards ----------

function JobCards({
  jobs,
  onNavigate,
}: {
  jobs: JobItem[];
  onNavigate: (id: string) => void;
}) {
  if (jobs.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Briefcase className="size-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Jobs</h2>
        <span className="text-sm text-muted-foreground">({jobs.length})</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const config = getJobStatusConfig(job.status);
          return (
            <Card
              key={job.id}
              className={`cursor-pointer border-l-4 transition-shadow hover:shadow-md ${config.borderColor}`}
              onClick={() => onNavigate(job.id)}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium">
                    {job.name}
                  </p>
                  <div
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor}`}
                  >
                    <CircleDot className={`size-2.5 ${config.dotColor}`} />
                    <span>{config.label}</span>
                  </div>
                </div>

                {job.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {job.description}
                  </p>
                )}

                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {job.assignedTo && (
                    <div className="flex items-center gap-1.5">
                      <User className="size-3" />
                      <span>{job.assignedTo.name}</span>
                    </div>
                  )}
                  {(job.siteName || job.plot) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3" />
                      <span>
                        {job.siteName}
                        {job.plot && ` / Plot ${job.plot}`}
                      </span>
                    </div>
                  )}
                  {(job.startDate || job.endDate) && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3" />
                      <span>
                        {job.startDate &&
                          format(new Date(job.startDate), "d MMM yyyy")}
                        {job.startDate && job.endDate && " - "}
                        {job.endDate &&
                          format(new Date(job.endDate), "d MMM yyyy")}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export function WorkflowDetailClient({
  workflow: initialWorkflow,
}: {
  workflow: WorkflowDetail;
}) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState(initialWorkflow);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(workflow.name);
  const [editDescription, setEditDescription] = useState(
    workflow.description ?? ""
  );
  const [editStatus, setEditStatus] = useState(workflow.status);
  const [saving, setSaving] = useState(false);

  // Add job state
  const [addJobDialogOpen, setAddJobDialogOpen] = useState(false);
  const [jobName, setJobName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobSiteName, setJobSiteName] = useState("");
  const [jobPlot, setJobPlot] = useState("");
  const [creatingJob, setCreatingJob] = useState(false);

  const statusConfig = getWorkflowStatusConfig(workflow.status);

  async function handleEditSave() {
    if (!editName.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          status: editStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update workflow");
      }

      const updated = await res.json();
      setWorkflow((prev) => ({
        ...prev,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        updatedAt: updated.updatedAt,
      }));
      setEditDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to update workflow:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddJob() {
    if (!jobName.trim()) return;

    setCreatingJob(true);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: jobName,
          description: jobDescription || null,
          siteName: jobSiteName || null,
          plot: jobPlot || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create job");
      }

      // Reset form and refresh data
      setJobName("");
      setJobDescription("");
      setJobSiteName("");
      setJobPlot("");
      setAddJobDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to create job:", error);
    } finally {
      setCreatingJob(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back button + Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/workflows")}
        >
          <ArrowLeft className="size-4" />
          Back to Workflows
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {workflow.name}
              </h1>
              <Badge variant={statusConfig.variant}>
                <CircleDot
                  className={`size-2.5 ${statusConfig.dotColor}`}
                />
                {statusConfig.label}
              </Badge>
            </div>
            {workflow.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {workflow.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Created by {workflow.createdBy.name}</span>
              <span className="text-border">&middot;</span>
              <span>
                {format(new Date(workflow.createdAt), "d MMM yyyy")}
              </span>
              <span className="text-border">&middot;</span>
              <span>{workflow._count.jobs} jobs</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Add Job Dialog */}
            <Dialog open={addJobDialogOpen} onOpenChange={setAddJobDialogOpen}>
              <DialogTrigger render={<Button variant="outline" />}>
                <Plus className="size-4" />
                Add Job
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Job</DialogTitle>
                  <DialogDescription>
                    Create a new job within this workflow.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="job-name">Job Name</Label>
                    <Input
                      id="job-name"
                      placeholder="e.g. Foundation Excavation"
                      value={jobName}
                      onChange={(e) => setJobName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job-description">Description</Label>
                    <Textarea
                      id="job-description"
                      placeholder="Describe the job..."
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="job-site">Site Name</Label>
                      <Input
                        id="job-site"
                        placeholder="e.g. Oakwood Park"
                        value={jobSiteName}
                        onChange={(e) => setJobSiteName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="job-plot">Plot</Label>
                      <Input
                        id="job-plot"
                        placeholder="e.g. 12"
                        value={jobPlot}
                        onChange={(e) => setJobPlot(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={handleAddJob}
                    disabled={creatingJob || !jobName.trim()}
                  >
                    {creatingJob ? "Creating..." : "Add Job"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog
              open={editDialogOpen}
              onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (open) {
                  setEditName(workflow.name);
                  setEditDescription(workflow.description ?? "");
                  setEditStatus(workflow.status);
                }
              }}
            >
              <DialogTrigger render={<Button variant="outline" />}>
                <Pencil className="size-4" />
                Edit
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Workflow</DialogTitle>
                  <DialogDescription>
                    Update this workflow&apos;s details.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={editStatus}
                      onValueChange={(v) => v !== null && setEditStatus(v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    onClick={handleEditSave}
                    disabled={saving || !editName.trim()}
                  >
                    <Save className="size-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Programme Timeline */}
      <ProgrammeTimeline jobs={workflow.jobs} />

      {/* Job Cards */}
      {workflow.jobs.length > 0 ? (
        <JobCards
          jobs={workflow.jobs}
          onNavigate={(id) => router.push(`/jobs/${id}`)}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Briefcase className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No jobs yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add your first job to this workflow to start tracking progress
              and assignments.
            </p>
            <Button
              className="mt-4"
              onClick={() => setAddJobDialogOpen(true)}
            >
              <Plus className="size-4" />
              Add Job
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
