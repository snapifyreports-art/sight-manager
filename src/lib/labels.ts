/**
 * Shared human-readable labels for raw enum codes.
 * Server-safe — no "use client", importable from API routes and components.
 */

export function titleCaseEnum(code: string | null | undefined): string {
  if (!code) return "";
  const words = code.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const LATENESS_REASON_LABELS: Record<string, string> = {
  WEATHER_RAIN: "Weather (rain)",
  WEATHER_TEMPERATURE: "Weather (temperature)",
  WEATHER_WIND: "Weather (wind)",
  MATERIAL_LATE: "Material — late",
  MATERIAL_WRONG: "Material — wrong",
  MATERIAL_SHORT: "Material — short",
  LABOUR_NO_SHOW: "Labour — no-show",
  LABOUR_SHORT: "Labour — short-staffed",
  DESIGN_CHANGE: "Design change",
  SPEC_CLARIFICATION: "Spec clarification",
  PREDECESSOR_LATE: "Predecessor late",
  ACCESS_BLOCKED: "Access blocked",
  INSPECTION_FAILED: "Inspection failed",
  OTHER: "Not attributed",
};

export function latenessReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return LATENESS_REASON_LABELS[code] ?? titleCaseEnum(code);
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

export function jobStatusLabel(code: string | null | undefined): string {
  if (!code) return "";
  return JOB_STATUS_LABELS[code] ?? titleCaseEnum(code);
}

export const HANDOVER_DOC_TYPE_LABELS: Record<string, string> = {
  EPC: "Energy Performance Certificate",
  GAS_SAFE_CERT: "Gas Safe Certificate",
  ELECTRICAL_CERT: "Electrical Installation Certificate",
  WARRANTY: "Warranty Documents",
  NHBC_CERT: "NHBC Certificate",
  BUILDING_REGS: "Building Regulations Approval",
  USER_MANUAL: "Appliance / User Manuals",
  FLOOR_PLAN: "Floor Plan",
  SNAGGING_SIGNOFF: "Snagging Sign-Off",
};
