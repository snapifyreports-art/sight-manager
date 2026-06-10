/**
 * Inspections SSoT — type → handover docType map + status colour.
 *
 * On a PASS, the matching HandoverChecklist item is OFFERED for ticking
 * (user-confirmed prompt, never auto). HandoverChecklist.docType values:
 * EPC | GAS_SAFE_CERT | ELECTRICAL_CERT | WARRANTY | NHBC_CERT |
 * BUILDING_REGS | USER_MANUAL | FLOOR_PLAN | SNAGGING_SIGNOFF.
 */
import type { InspectionType, InspectionStatus } from "@prisma/client";

/** null = no matching handover item → no tick prompt on pass. */
export const INSPECTION_DOCTYPE_MAP: Record<InspectionType, string | null> = {
  NHBC: "NHBC_CERT",
  BUILDING_CONTROL: "BUILDING_REGS",
  WARRANTY_CML: "WARRANTY",
  INTERNAL_QA: "SNAGGING_SIGNOFF",
  OTHER: null,
};

export function handoverDocTypeForInspection(type: InspectionType): string | null {
  return INSPECTION_DOCTYPE_MAP[type] ?? null;
}

/** Marker / chip colour per status (used by the `!` Gantt marker + lists).
 * (Jun 2026 Q1) OVERDUE is genuinely red — "nothing booked, date passed" is
 * the alarm state. An OVERDUE row that HAS a booking held renders amber via
 * inspectionDisplayStatus below, so red always means "act now". */
export function inspectionStatusColor(status: InspectionStatus): string {
  switch (status) {
    case "SCHEDULED":
      return "#6b7280"; // gray-500
    case "BOOKED":
      return "#2563eb"; // blue-600
    case "PASSED":
      return "#16a34a"; // green-600
    case "FAILED":
      return "#dc2626"; // red-600
    case "OVERDUE":
      return "#dc2626"; // red-600 — date passed, nothing booked
    default:
      return "#6b7280";
  }
}

/**
 * (Jun 2026 Q1) Display status for lists/chips. An OVERDUE inspection with
 * a booking already held isn't really overdue — the visit is arranged, the
 * date just slipped past — so it shows amber "Booked (was overdue)" rather
 * than crying wolf in red. Red is reserved for date-passed-nothing-booked.
 */
export function inspectionDisplayStatus(
  status: InspectionStatus,
  bookedDate?: Date | string | null,
): { label: string; hex: string; bookedOverdue: boolean } {
  if (status === "OVERDUE" && bookedDate) {
    return { label: "Booked (was overdue)", hex: "#d97706", bookedOverdue: true }; // amber-600
  }
  return { label: inspectionStatusLabel(status), hex: inspectionStatusColor(status), bookedOverdue: false };
}

/**
 * (Jun 2026 S10 + Q21) Shared per-TYPE label + colour — used by the list
 * type badge, the template timeline markers, and their legends, so the
 * same inspection type always reads as the same colour everywhere.
 */
export const INSPECTION_TYPE_META: Record<
  InspectionType,
  { label: string; hex: string; bg: string; text: string; hint: string }
> = {
  NHBC: { label: "NHBC", hex: "#059669", bg: "bg-emerald-100", text: "text-emerald-700", hint: "NHBC warranty inspection — statutory hold-point" },
  BUILDING_CONTROL: { label: "Building Control", hex: "#2563eb", bg: "bg-blue-100", text: "text-blue-700", hint: "Building Control inspection — statutory hold-point" },
  WARRANTY_CML: { label: "Warranty/CML", hex: "#7c3aed", bg: "bg-violet-100", text: "text-violet-700", hint: "Warranty / CML lender inspection" },
  INTERNAL_QA: { label: "Internal QA", hex: "#475569", bg: "bg-slate-200", text: "text-slate-700", hint: "Internal quality check (e.g. Clerk of Works)" },
  OTHER: { label: "Other", hex: "#d97706", bg: "bg-amber-100", text: "text-amber-700", hint: "Other inspection" },
};

export function inspectionTypeLabel(type: string): string {
  return INSPECTION_TYPE_META[type as InspectionType]?.label ?? type;
}

export function inspectionStatusLabel(status: InspectionStatus): string {
  switch (status) {
    case "SCHEDULED":
      return "Scheduled";
    case "BOOKED":
      return "Booked";
    case "PASSED":
      return "Passed";
    case "FAILED":
      return "Failed";
    case "OVERDUE":
      return "Overdue";
    default:
      return status;
  }
}
