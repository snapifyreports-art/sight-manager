/**
 * Type definitions for the SiteProgramme module.
 *
 * (May 2026 sprint 7b) Extracted from the monolithic
 * `SiteProgramme.tsx`. These are the shapes returned by
 * `GET /api/sites/[id]/programme` plus the WeatherDay row from the
 * weather endpoint. Keep in lock-step with the route handlers — a
 * mismatch surfaces as a TS error at the render site.
 */

export interface ProgrammeOrder {
  id: string;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  leadTimeDays: number | null;
  status: string;
  supplier: { name: string };
}

export interface ProgrammeJob {
  id: string;
  name: string;
  status: string;
  stageCode: string | null;
  startDate: string | null;
  endDate: string | null;
  originalStartDate?: string | null;
  originalEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  sortOrder: number;
  weatherAffected?: boolean;
  parentId: string | null;
  parentStage: string | null;
  orders?: ProgrammeOrder[];
  _count?: { photos: number; actions: number };
  // For synthetic parent jobs: all calendar positions where dots
  // should appear (one per child with photos/notes — keeps Jobs and
  // Sub-Jobs views consistent).
  _dotStartDates?: string[];
}

export interface ProgrammePlot {
  id: string;
  name: string;
  plotNumber: string | null;
  houseType: string | null;
  reservationType: string | null;
  reservationDate: string | null;
  exchangeDate: string | null;
  legalDate: string | null;
  approvalG: boolean;
  approvalE: boolean;
  approvalW: boolean;
  approvalKCO: boolean;
  buildCompletePercent: number;
  // Source template + variant captured at apply time. Surfaced in
  // the expanded left panel "House" column so it's clear which
  // template / variant a plot came from. SetNull on relation, so
  // either may be null if the source was deleted (or for manually-
  // created plots).
  sourceTemplate: { id: string; name: string } | null;
  sourceVariant: { id: string; name: string } | null;
  jobs: ProgrammeJob[];
}

export interface ProgrammeSite {
  id: string;
  name: string;
  postcode: string | null;
  rainedOffDays?: {
    date: string;
    type: "RAIN" | "TEMPERATURE";
    note?: string | null;
  }[];
  plots: ProgrammePlot[];
}

export interface WeatherDay {
  date: string;
  category: string;
  tempMax: number;
  tempMin: number;
}

/**
 * Status priority for picking a "dominant" job when multiple
 * overlap the same cell. IN_PROGRESS wins so the cell colour
 * reflects what's actually happening on site; ON_HOLD next so
 * problems aren't hidden; then NOT_STARTED before COMPLETED so an
 * upcoming stage shows over a finished one in cells where a long-
 * tail job overlaps with new work.
 */
export const STATUS_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 0,
  ON_HOLD: 1,
  NOT_STARTED: 2,
  COMPLETED: 3,
};

// (May 2026 Keith request) Bumped 22 → 32 so the day-view weather row
// can stack the forecast icon AND the max/min temperature under it.
export const WEATHER_ROW_HEIGHT = 32;
