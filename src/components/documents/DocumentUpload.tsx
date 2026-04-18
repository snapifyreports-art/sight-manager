"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

interface DocumentUploadProps {
  siteId: string;
  plotId?: string;
  jobId?: string;
  onUploaded: () => void;
}

const ACCEPTED = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.csv,.txt";

export function DocumentUpload({
  siteId,
  plotId,
  jobId,
  onUploaded,
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      const failures: string[] = [];
      let successes = 0;
      try {
        for (const file of Array.from(files)) {
          if (file.size > 10 * 1024 * 1024) {
            failures.push(`${file.name}: exceeds 10MB limit`);
            continue;
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("name", file.name);
          if (plotId) formData.append("plotId", plotId);
          if (jobId) formData.append("jobId", jobId);

          try {
            const res = await fetch(`/api/sites/${siteId}/documents`, {
              method: "POST",
              body: formData,
            });
            if (!res.ok) {
              const msg = await fetchErrorMessage(res, "Upload failed");
              failures.push(`${file.name}: ${msg}`);
            } else {
              successes++;
            }
          } catch (error) {
            failures.push(
              `${file.name}: ${error instanceof Error ? error.message : "Network error"}`
            );
          }
        }
        if (failures.length > 0) {
          const summary =
            failures.length === 1
              ? failures[0]
              : `${failures.length} files failed to upload: ${failures.join("; ")}`;
          toast.error(summary);
        }
        if (successes > 0) onUploaded();
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [siteId, plotId, jobId, onUploaded, toast]
  );

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
        dragOver
          ? "border-blue-400 bg-blue-50"
          : "border-slate-200 hover:border-slate-300"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="size-4 animate-spin text-blue-500" />
          <span className="text-sm text-muted-foreground">Uploading...</span>
        </div>
      ) : (
        <button
          className="flex w-full flex-col items-center gap-1 py-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Drop files here or click to browse
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            PDF, Word, Excel, Images — max 10MB
          </span>
        </button>
      )}
    </div>
  );
}
