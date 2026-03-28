"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Sibling {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  parentStage: string | null;
}

interface JobSiblingNavProps {
  jobId: string;
}

const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-gray-300",
  IN_PROGRESS: "bg-blue-500",
  ON_HOLD: "bg-yellow-500",
  COMPLETED: "bg-green-500",
};

export function JobSiblingNav({ jobId }: JobSiblingNavProps) {
  const router = useRouter();
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/jobs/${jobId}/siblings`)
      .then((r) => r.json())
      .then((data) => {
        setSiblings(data.siblings || []);
      })
      .catch(() => setSiblings([]))
      .finally(() => setLoading(false));
  }, [jobId]);

  const currentIndex = siblings.findIndex((s) => s.id === jobId);
  const prev = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const next = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
  const current = currentIndex >= 0 ? siblings[currentIndex] : null;

  const handleNav = useCallback(
    (targetId: string) => {
      router.push(`/jobs/${targetId}`);
    },
    [router]
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't navigate if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        handleNav(prev.id);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        handleNav(next.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prev, next, handleNav]);

  if (loading || siblings.length <= 1) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-2 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={!prev}
        onClick={() => prev && handleNav(prev.id)}
      >
        <ChevronLeft className="size-3.5" />
        <span className="hidden sm:inline">{prev?.name || "Prev"}</span>
        <span className="sm:hidden">Prev</span>
      </Button>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {current && (
          <span className={cn("size-2 rounded-full", STATUS_DOT[current.status] || "bg-gray-300")} />
        )}
        <span className="font-medium text-foreground">
          {currentIndex + 1} of {siblings.length}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={!next}
        onClick={() => next && handleNav(next.id)}
      >
        <span className="hidden sm:inline">{next?.name || "Next"}</span>
        <span className="sm:hidden">Next</span>
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}
