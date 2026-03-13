"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  Users,
  HardHat,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Printer,
  Package,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ContractorDaySheetsProps {
  siteId: string;
}

interface JobItem {
  id: string;
  name: string;
  status: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  plot: { plotNumber: string | null; name: string; houseType: string | null };
  deliveries: Array<{
    id: string;
    items: string | null;
    supplier: string;
    expectedDate: string | null;
  }>;
}

interface DaySheetsData {
  date: string;
  siteId: string;
  contractorSheets: Array<{
    contractor: {
      id: string;
      name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
    };
    jobs: JobItem[];
  }>;
  assigneeSheets: Array<{
    assignee: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
    jobs: JobItem[];
  }>;
  unassignedJobs: JobItem[];
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "IN_PROGRESS"
      ? "bg-blue-100 text-blue-700"
      : status === "NOT_STARTED"
        ? "bg-slate-100 text-slate-600"
        : status === "ON_HOLD"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-green-100 text-green-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function JobRow({ job }: { job: JobItem }) {
  return (
    <div className="rounded border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{job.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {job.plot.plotNumber ? `Plot ${job.plot.plotNumber}` : job.plot.name}
              {job.plot.houseType && ` (${job.plot.houseType})`}
            </span>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>
      {job.description && (
        <p className="mt-1 text-xs text-muted-foreground">{job.description}</p>
      )}
      {job.deliveries.length > 0 && (
        <div className="mt-2 space-y-1">
          {job.deliveries.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-1.5 text-xs text-blue-600"
            >
              <Package className="size-3" />
              <span>
                Delivery: {d.items || "Materials"} from {d.supplier}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContractorDaySheets({ siteId }: ContractorDaySheetsProps) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<DaySheetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(getCurrentDate());

  useEffect(() => {
    setLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");
    fetch(`/api/sites/${siteId}/day-sheets?date=${dateStr}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, date, devDate]);

  const prevDay = () => setDate((d) => new Date(d.getTime() - 86400000));
  const nextDay = () => setDate((d) => new Date(d.getTime() + 86400000));
  const goToday = () => setDate(getCurrentDate());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const totalSheets =
    data.contractorSheets.length +
    data.assigneeSheets.length +
    (data.unassignedJobs.length > 0 ? 1 : 0);

  const totalJobs =
    data.contractorSheets.reduce((s, c) => s + c.jobs.length, 0) +
    data.assigneeSheets.reduce((s, a) => s + a.jobs.length, 0) +
    data.unassignedJobs.length;

  return (
    <div className="space-y-4">
      {/* Date nav + print */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevDay}>
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="text-lg font-semibold">
            {format(date, "EEEE, d MMMM yyyy")}
          </h3>
          <Button variant="outline" size="icon" onClick={nextDay}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{totalJobs} jobs across {totalSheets} sheets</Badge>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer className="mr-1 size-4" />
            Print
          </Button>
        </div>
      </div>

      {totalJobs === 0 && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <HardHat className="mb-2 size-8 opacity-30" />
          <p className="text-sm">No jobs scheduled for this date</p>
        </div>
      )}

      {/* Contractor sheets */}
      {data.contractorSheets.map((sheet) => (
        <Card key={sheet.contractor.id} className="print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <HardHat className="size-4 text-orange-600" />
                {sheet.contractor.company || sheet.contractor.name}
              </span>
              <Badge variant="outline">{sheet.jobs.length} job{sheet.jobs.length !== 1 ? "s" : ""}</Badge>
            </CardTitle>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{sheet.contractor.name}</span>
              {sheet.contractor.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />
                  {sheet.contractor.phone}
                </span>
              )}
              {sheet.contractor.email && (
                <span className="flex items-center gap-1">
                  <Mail className="size-3" />
                  {sheet.contractor.email}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sheet.jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Staff assignee sheets */}
      {data.assigneeSheets.map((sheet) => (
        <Card key={sheet.assignee.id} className="print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Users className="size-4 text-blue-600" />
                {sheet.assignee.name}
              </span>
              <Badge variant="outline">{sheet.jobs.length} job{sheet.jobs.length !== 1 ? "s" : ""}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{sheet.assignee.role.replace("_", " ")}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sheet.jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Unassigned */}
      {data.unassignedJobs.length > 0 && (
        <Card className="border-yellow-200 print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-yellow-700">
              <span>Unassigned Jobs</span>
              <Badge variant="outline">{data.unassignedJobs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.unassignedJobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
