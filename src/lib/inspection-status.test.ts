import { describe, it, expect } from "vitest";
import { bookingDueDate, isBookingDueOn } from "./inspection-status";
import {
  handoverDocTypeForInspection,
  INSPECTION_DOCTYPE_MAP,
} from "./inspection-doctype";

const ymd = (d: Date | null) =>
  d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null;

describe("bookingDueDate / isBookingDueOn", () => {
  const sched = new Date(2026, 5, 29); // Mon 29 Jun

  it("is scheduledDate minus bookingLeadWeeks*7 calendar days", () => {
    // 2 weeks before 29 Jun = 15 Jun
    expect(ymd(bookingDueDate({ scheduledDate: sched, bookingLeadWeeks: 2 }))).toBe("2026-6-15");
  });

  it("returns null when no lead is set", () => {
    expect(bookingDueDate({ scheduledDate: sched, bookingLeadWeeks: null })).toBeNull();
  });

  it("isBookingDueOn true only on the booking-due day", () => {
    const insp = { scheduledDate: sched, bookingLeadWeeks: 2 };
    expect(isBookingDueOn(insp, new Date(2026, 5, 15))).toBe(true);
    expect(isBookingDueOn(insp, new Date(2026, 5, 14))).toBe(false);
    expect(isBookingDueOn(insp, new Date(2026, 5, 16))).toBe(false);
  });

  it("no lead → never booking-due", () => {
    expect(isBookingDueOn({ scheduledDate: sched, bookingLeadWeeks: null }, new Date(2026, 5, 15))).toBe(false);
  });
});

describe("handover docType map", () => {
  it("maps each inspection type to a handover docType (or null)", () => {
    expect(handoverDocTypeForInspection("NHBC")).toBe("NHBC_CERT");
    expect(handoverDocTypeForInspection("BUILDING_CONTROL")).toBe("BUILDING_REGS");
    expect(handoverDocTypeForInspection("WARRANTY_CML")).toBe("WARRANTY");
    expect(handoverDocTypeForInspection("INTERNAL_QA")).toBe("SNAGGING_SIGNOFF");
    expect(handoverDocTypeForInspection("OTHER")).toBeNull();
  });

  it("covers every InspectionType key", () => {
    expect(Object.keys(INSPECTION_DOCTYPE_MAP).sort()).toEqual(
      ["BUILDING_CONTROL", "INTERNAL_QA", "NHBC", "OTHER", "WARRANTY_CML"],
    );
  });
});
