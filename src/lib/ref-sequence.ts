/**
 * (Jun 2026 audit) Sequential refs ("NCR-007", "VAR-002", "DEF-013") for
 * the formal QA paper trail (PDFs, Story register, handover pack).
 *
 * Pre-fix every create path computed `PREFIX-${count + 1}`, which mints
 * DUPLICATE refs as soon as any record is deleted: NCR-001..003 exist,
 * delete NCR-002, next create → count=2 → "NCR-003" again, colliding
 * with the live NCR-003. Deriving from the max existing numeric suffix
 * instead leaves holes as holes — the next ref is always unique within
 * the scope (site for NCRs, plot for VARs/DEFs).
 *
 * Concurrent creates can still race the same number (no unique index on
 * ref), but the window is the same as before and the delete-duplication
 * bug — the one that bites in practice — is gone.
 */

/** Highest numeric suffix among `PREFIX-NNN` refs (0 when none match). */
export function maxRefNumber(prefix: string, refs: Array<string | null>): number {
  let max = 0;
  for (const ref of refs) {
    if (!ref || !ref.startsWith(`${prefix}-`)) continue;
    const n = parseInt(ref.slice(prefix.length + 1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Next free ref, zero-padded to 3 ("NCR-004"). */
export function nextRef(prefix: string, refs: Array<string | null>): string {
  return `${prefix}-${String(maxRefNumber(prefix, refs) + 1).padStart(3, "0")}`;
}
