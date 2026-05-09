"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Click-to-edit duration cell.
 *
 * Why this exists (Keith, May 2026):
 * "the templates where you can change the dates in the image it cant
 *  just be editable on the screen its got to be click to edit them
 *  update if you get me its a hard change not just a stupid little
 *  flick of the switch"
 *
 * Default state shows the value as a read-only chip. Click → input
 * appears with the value pre-selected; Enter or blur saves; Escape
 * reverts. Saving disables the input and shows a small spinner so a
 * fast re-click can't fire a second save before the first lands.
 *
 * The save handler is awaited; on rejection we revert to the old
 * value and keep the chip in read-only mode so the user can retry.
 */
export interface DurationCellProps {
  /** Current saved value, in working days. */
  value: number;
  /** Min permitted value (default 1). */
  min?: number;
  /** Max permitted value (default 365). */
  max?: number;
  /** Unit suffix shown next to the number — usually "d". */
  unit?: string;
  /** Persistence callback. Should resolve when the new value is durable. */
  onSave: (newValue: number) => Promise<void>;
  /** Tooltip on hover. Defaults to "Click to edit". */
  title?: string;
  /** Extra classes for the chip / input wrapper. */
  className?: string;
}

export function DurationCell({
  value,
  min = 1,
  max = 365,
  unit = "d",
  onSave,
  title,
  className,
}: DurationCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks whether Escape was pressed *just before* the blur — without
  // this, blur would still fire a save after Escape because key events
  // fire before the input loses focus.
  const cancelledRef = useRef(false);

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    if (saving) return;
    setDraft(String(value));
    cancelledRef.current = false;
    setEditing(true);
  }

  // After we flip into edit mode, focus + select the input so the user
  // can immediately overwrite the value with a number.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    const parsed = parseInt(draft, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, parsed))
      : value;
    if (clamped === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(clamped);
      setEditing(false);
    } catch {
      // Caller is responsible for surfacing the error (toast). We just
      // bail back to read-only mode at the original value so the user
      // can retry with a fresh click.
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    cancelledRef.current = true;
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  function onBlur() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    void commit();
  }

  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onClick={(e) => e.stopPropagation()}
          disabled={saving}
          className={`h-7 w-16 text-center text-xs ${className ?? ""}`}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={saving}
      title={title ?? `${value}${unit} — click to edit`}
      className={`group inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors hover:bg-slate-100 disabled:opacity-60 ${className ?? ""}`}
    >
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-muted-foreground">{unit}</span>
      {saving ? (
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      ) : (
        <Pencil className="size-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
