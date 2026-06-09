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

/** Marker / chip colour per status (used by the `!` Gantt marker + lists). */
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
      return "#f59e0b"; // amber-500
    default:
      return "#6b7280";
  }
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
