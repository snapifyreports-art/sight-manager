"use client";

import { useState } from "react";
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Download,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";

interface Document {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  plotId?: string | null;
  jobId?: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
  plot?: { id: string; name: string; plotNumber: string | null } | null;
  job?: { id: string; name: string } | null;
}

interface DocumentListProps {
  documents: Document[];
  onDelete: (id: string) => void;
  level?: "site" | "plot" | "job";
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="size-4 text-slate-400" />;
  if (mimeType.startsWith("image/"))
    return <FileImage className="size-4 text-blue-500" />;
  if (mimeType.includes("pdf"))
    return <FileText className="size-4 text-red-500" />;
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="size-4 text-green-500" />;
  return <File className="size-4 text-slate-400" />;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents, onDelete, level = "site" }: DocumentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete this document?",
      body: "This cannot be undone. If the document is referenced by a handover checklist, that checklist item will become unchecked.",
      confirmLabel: "Delete document",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to delete document"));
        return;
      }
      onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (documents.length === 0) {
    // (May 2026 audit #39) Empty state coach. Pre-fix this just said
    // "No documents uploaded yet" with no hint about what to do or
    // why. The follow-up copy tells managers what categories matter
    // for the handover ZIP — certs, drawings, RAMS — so they upload
    // the right things rather than a folder of holiday photos.
    return (
      <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
        <File className="mb-2 size-8 opacity-30" />
        <p className="text-sm font-medium text-slate-700">No documents uploaded yet</p>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Upload certificates, drawings, specifications, and RAMS as you go.
          They&apos;ll be picked up automatically by the Handover ZIP at site
          completion.
        </p>
      </div>
    );
  }

  // Group by level if showing site-level
  if (level === "site") {
    const siteDocs = documents.filter((d) => !d.plotId && !d.jobId);
    const plotGroups: Record<string, { label: string; docs: Document[] }> = {};

    for (const doc of documents) {
      if (!doc.plot) continue;
      const key = doc.plot.id;
      if (!plotGroups[key]) {
        plotGroups[key] = {
          label: `Plot ${doc.plot.plotNumber || doc.plot.name}`,
          docs: [],
        };
      }
      plotGroups[key].docs.push(doc);
    }

    return (
      <div className="space-y-4">
        {siteDocs.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Site Documents
            </h4>
            <DocTable docs={siteDocs} deletingId={deletingId} onDelete={handleDelete} />
          </div>
        )}
        {Object.entries(plotGroups).map(([plotId, group]) => (
          <div key={plotId}>
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {group.label}
            </h4>
            <DocTable
              docs={group.docs}
              deletingId={deletingId}
              onDelete={handleDelete}
              showJob
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {confirmDialog}
      <DocTable
        docs={documents}
        deletingId={deletingId}
        onDelete={handleDelete}
        showJob={level === "plot"}
      />
    </>
  );
}

function DocTable({
  docs,
  deletingId,
  onDelete,
  showJob,
}: {
  docs: Document[];
  deletingId: string | null;
  onDelete: (id: string) => void;
  showJob?: boolean;
}) {
  return (
    <div className="divide-y rounded-lg border">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50"
        >
          {getFileIcon(doc.mimeType)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {formatSize(doc.fileSize)} &middot; {doc.uploadedBy.name} &middot;{" "}
              {new Date(doc.createdAt).toLocaleDateString()}
              {showJob && doc.job && ` · ${doc.job.name}`}
            </p>
          </div>
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-blue-600"
          >
            <Download className="size-3.5" />
          </a>
          <button
            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
            onClick={() => onDelete(doc.id)}
            disabled={deletingId === doc.id}
          >
            {deletingId === doc.id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
