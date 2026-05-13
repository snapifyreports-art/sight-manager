/**
 * Approval status dot used in the SiteProgramme left-panel column.
 *
 * (May 2026 sprint 7b) Extracted from SiteProgramme.tsx.
 *
 * - Green filled with white check = approved
 * - White outlined empty box = pending
 *
 * a11y notes (UX-P0-5 + UX-P2):
 *   - role="img" + aria-label so screen readers get state info
 *   - Vector `<Check>` icon at 10px renders crisply at any zoom;
 *     pre-fix used a literal "✓" character at 8px which collapsed
 *     to a single pixel on retina+Windows.
 */

import { Check } from "lucide-react";

export interface ApprovalDotProps {
  approved: boolean;
  /**
   * (May 2026 audit UX-P0-5) Required for screen readers — pre-fix
   * the dot relied on green-vs-white colour alone to convey state.
   * Caller passes "Gas approval", "Electric approval", etc.
   */
  label?: string;
}

export function ApprovalDot({ approved, label }: ApprovalDotProps) {
  return (
    <div
      role="img"
      aria-label={`${label ?? "Approval"}: ${approved ? "approved" : "pending"}`}
      className={`flex size-3.5 items-center justify-center rounded-sm ${
        approved
          ? "bg-green-500 text-white"
          : "border border-slate-300 bg-white"
      }`}
    >
      {approved && <Check className="size-2.5" aria-hidden />}
    </div>
  );
}
