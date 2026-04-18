"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Download,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface HandoverDoc {
  id: string;
  name: string;
  url: string;
  fileName: string;
}

interface ChecklistItem {
  id: string;
  docType: string;
  label: string;
  required: boolean;
  document: HandoverDoc | null;
  checkedAt: string | null;
  checkedBy: { id: string; name: string } | null;
  notes: string | null;
}

interface HandoverData {
  items: ChecklistItem[];
  summary: {
    total: number;
    checked: number;
    required: number;
    requiredChecked: number;
  };
}

interface AvailableDoc {
  id: string;
  name: string;
  fileName: string;
}

export function HandoverChecklist({ plotId }: { plotId: string }) {
  const [data, setData] = useState<HandoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [docs, setDocs] = useState<AvailableDoc[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch(`/api/plots/${plotId}/handover`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [plotId]);

  useEffect(() => {
    fetchData();
    // Fetch available documents for linking
    fetch(`/api/plots/${plotId}`)
      .then((r) => r.json())
      .then((plot) => {
        if (plot.siteId) {
          fetch(`/api/sites/${plot.siteId}/documents`)
            .then((r) => r.json())
            .then((d) => {
              if (Array.isArray(d)) setDocs(d);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [plotId, fetchData]);

  const handleCheck = async (itemId: string, checked: boolean) => {
    const res = await fetch(`/api/plots/${plotId}/handover`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, checked }),
    });
    if (res.ok) fetchData();
  };

  const handleLinkDoc = async (itemId: string, documentId: string) => {
    const res = await fetch(`/api/plots/${plotId}/handover`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, documentId }),
    });
    if (res.ok) {
      setLinkingId(null);
      fetchData();
    }
  };

  const handleGeneratePDF = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/handover`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `handover-pack.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const progressPct = summary.total > 0
    ? Math.round((summary.checked / summary.total) * 100)
    : 0;
  const missingRequired = summary.required - summary.requiredChecked;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                Handover Progress: {summary.checked}/{summary.total} documents
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.requiredChecked}/{summary.required} required items
                complete
              </p>
            </div>
            <span className="text-2xl font-bold">{progressPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                progressPct === 100 ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Warning if required docs missing */}
      {missingRequired > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          {missingRequired} required document{missingRequired !== 1 ? "s" : ""}{" "}
          still missing
        </div>
      )}

      {/* Checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Document Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2.5"
              >
                {/* Check toggle */}
                <button
                  onClick={() => handleCheck(item.id, !item.checkedAt)}
                  className="shrink-0"
                >
                  {item.checkedAt ? (
                    <CheckCircle2 className="size-5 text-green-500" />
                  ) : (
                    <Circle className="size-5 text-slate-300" />
                  )}
                </button>

                {/* Label + status */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      item.checkedAt ? "text-green-700 line-through" : ""
                    }`}
                  >
                    {item.label}
                    {item.required && (
                      <span className="ml-1 text-[10px] text-red-500">*</span>
                    )}
                  </p>
                  {item.document ? (
                    <p className="truncate text-xs text-blue-600">
                      {item.document.name}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No document linked
                    </p>
                  )}
                  {item.checkedBy && (
                    <p className="text-[10px] text-muted-foreground">
                      Checked by {item.checkedBy.name}
                    </p>
                  )}
                </div>

                {/* Link document */}
                {!item.document && linkingId !== item.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => setLinkingId(item.id)}
                  >
                    <Link2 className="mr-1 size-3" />
                    Link
                  </Button>
                )}

                {/* Document picker */}
                {linkingId === item.id && (
                  <div className="shrink-0">
                    <select
                      className="rounded border px-2 py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value)
                          handleLinkDoc(item.id, e.target.value);
                      }}
                    >
                      <option value="">Select doc...</option>
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 text-xs"
                      onClick={() => setLinkingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Generate PDF */}
      <Button
        onClick={handleGeneratePDF}
        disabled={generating}
        className="w-full"
      >
        {generating ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Download className="mr-2 size-4" />
        )}
        {generating ? "Generating..." : "Generate Handover Pack (PDF)"}
      </Button>
    </div>
  );
}
