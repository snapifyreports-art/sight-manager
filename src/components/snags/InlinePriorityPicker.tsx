"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { SnagPriorityBadge } from "@/components/shared/StatusBadge";

type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Inline priority editor for a snag. Shows the priority badge; clicking
 * it reveals a tiny select that commits on change. PATCHes
 * /api/snags/:id with { priority } and calls onChanged for list refresh.
 *
 * Keith Apr 2026 UX audit — status shown everywhere but rarely editable
 * inline. This surface solves the "I need to change one snag's priority
 * without opening the full dialog" case.
 */
export function InlinePriorityPicker({
  snagId,
  priority,
  onChanged,
}: {
  snagId: string;
  priority: Priority;
  onChanged?: (newPriority: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Priority>(priority);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleChange = async (next: Priority) => {
    if (next === current) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/snags/${snagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      });
      if (res.ok) {
        setCurrent(next);
        onChanged?.(next);
        toast.success(`Priority set to ${next}`);
      } else {
        toast.error("Failed to update priority");
      }
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  if (saving) {
    return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  }

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Click to change priority"
        className="rounded transition-opacity hover:opacity-80"
      >
        <SnagPriorityBadge priority={current} />
      </button>
    );
  }

  return (
    <select
      autoFocus
      value={current}
      onChange={(e) => handleChange(e.target.value as Priority)}
      onBlur={() => setOpen(false)}
      onClick={(e) => e.stopPropagation()}
      className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase"
    >
      <option value="LOW">Low</option>
      <option value="MEDIUM">Medium</option>
      <option value="HIGH">High</option>
      <option value="CRITICAL">Critical</option>
    </select>
  );
}
