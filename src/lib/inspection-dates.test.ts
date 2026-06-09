import { describe, it, expect } from "vitest";
import {
  computeInspectionScheduledDate,
  computeTemplateInspectionDates,
} from "./inspection-dates";

// June 2026: 1,8,15,22 are Mondays; 5,12,19,26 are Fridays.
const MON_15 = new Date(2026, 5, 15);
const FRI_19 = new Date(2026, 5, 19);
const ymd = (d: Date | null) =>
  d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null;

describe("computeInspectionScheduledDate", () => {
  const anchor = { startDate: MON_15, endDate: FRI_19 };

  it("START edge, offset 0 = the start date", () => {
    expect(ymd(computeInspectionScheduledDate(anchor, "START", 0))).toBe("2026-6-15");
  });

  it("END edge, offset 0 = the end date", () => {
    expect(ymd(computeInspectionScheduledDate(anchor, "END", 0))).toBe("2026-6-19");
  });

  it("negative offset goes back in WORKING days (skips weekend)", () => {
    // 5 working days before Mon 15 = Mon 8
    expect(ymd(computeInspectionScheduledDate(anchor, "START", -5))).toBe("2026-6-8");
  });

  it("positive offset advances in WORKING days", () => {
    // 3 working days after Mon 15 = Thu 18
    expect(ymd(computeInspectionScheduledDate(anchor, "START", 3))).toBe("2026-6-18");
    // 1 working day after Fri 19 = Mon 22 (skips the weekend)
    expect(ymd(computeInspectionScheduledDate(anchor, "END", 1))).toBe("2026-6-22");
  });

  it("always lands on a working day (snaps a weekend anchor)", () => {
    const sat = new Date(2026, 5, 20); // Saturday
    const d = computeInspectionScheduledDate({ startDate: sat, endDate: sat }, "START", 0);
    expect(d!.getDay()).not.toBe(0);
    expect(d!.getDay()).not.toBe(6);
  });

  it("is idempotent — same inputs give the same date", () => {
    const a = computeInspectionScheduledDate(anchor, "START", -5);
    const b = computeInspectionScheduledDate(anchor, "START", -5);
    expect(a!.getTime()).toBe(b!.getTime());
  });

  it("returns null when the anchor has no date for the edge", () => {
    expect(computeInspectionScheduledDate({ startDate: null, endDate: FRI_19 }, "START", 0)).toBeNull();
    expect(computeInspectionScheduledDate({ startDate: MON_15, endDate: null }, "END", 0)).toBeNull();
  });

  it("accepts ISO string dates", () => {
    expect(
      ymd(computeInspectionScheduledDate({ startDate: "2026-06-15T00:00:00", endDate: null }, "START", 0)),
    ).toBe("2026-6-15");
  });
});

describe("computeTemplateInspectionDates", () => {
  it("resolves each inspection against the template date map", () => {
    const map = new Map([
      ["jobA", { start: MON_15, end: FRI_19 }],
      ["jobB", { start: new Date(2026, 5, 22), end: new Date(2026, 5, 26) }],
    ]);
    const out = computeTemplateInspectionDates(
      [
        { id: "i1", anchorTemplateJobId: "jobA", anchorEdge: "END", offsetDays: 0 },
        { id: "i2", anchorTemplateJobId: "jobB", anchorEdge: "START", offsetDays: -5 },
        { id: "i3", anchorTemplateJobId: "missing", anchorEdge: "START", offsetDays: 0 },
      ],
      map,
    );
    expect(ymd(out.get("i1")!)).toBe("2026-6-19"); // end of jobA
    expect(ymd(out.get("i2")!)).toBe("2026-6-15"); // 5 wd before Mon 22 = Mon 15
    expect(out.has("i3")).toBe(false); // unknown anchor skipped
  });
});
