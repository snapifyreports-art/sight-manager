import { describe, it, expect } from "vitest";
import {
  buildJobTimeline,
  legacyTimelineFields,
  type TimelineJobInput,
} from "./job-timeline";

/**
 * Fixture tests for the canonical job-timeline helper.
 *
 * If any of these fail, EVERY view that calls buildJobTimeline is at
 * risk of showing wrong data. Treat failures as critical regressions.
 *
 * Conventions in this file:
 *   - Dates are ISO strings — easier to read than `new Date(2026, 4, ...)`.
 *   - Plots start on a Monday (2026-05-04 is a Monday) so
 *     working-day arithmetic is intuitive.
 */

// Helper: build a job with sane defaults so tests stay short.
function job(overrides: Partial<TimelineJobInput>): TimelineJobInput {
  const base: TimelineJobInput = {
    id: "j1",
    name: "Test job",
    status: "NOT_STARTED",
    sortOrder: 100,
    parentId: null,
    parentStage: null,
    startDate: "2026-05-04",
    endDate: "2026-05-08",
    originalStartDate: "2026-05-04",
    originalEndDate: "2026-05-08",
    actualStartDate: null,
    actualEndDate: null,
    weatherAffected: false,
  };
  return { ...base, ...overrides };
}

describe("buildJobTimeline — empty + edge cases", () => {
  it("returns empty timeline when no jobs are scheduled", () => {
    const t = buildJobTimeline([]);
    expect(t.jobs).toHaveLength(0);
    expect(t.totalWorkingDays).toBe(0);
  });

  it("excludes jobs with null startDate or endDate", () => {
    const t = buildJobTimeline([
      job({ id: "scheduled" }),
      job({ id: "unsched", startDate: null, endDate: null }),
    ]);
    expect(t.jobs.map((j) => j.id)).toEqual(["scheduled"]);
  });
});

describe("buildJobTimeline — working-day arithmetic", () => {
  it("computes working-day duration correctly across a weekend", () => {
    // Mon 4 May → Mon 11 May = 5 working days (Mon-Fri week 1, then Mon)
    // workingDuration floors at 1 and is computed via
    // differenceInWorkingDays(end, start). Real expectation: 5.
    const t = buildJobTimeline([
      job({
        startDate: "2026-05-04", // Mon
        endDate: "2026-05-11", // Mon next week
      }),
    ]);
    expect(t.jobs[0].planned.durationDays).toBe(5);
  });

  it("anchors plot at earliest leaf startDate, offsets are working days", () => {
    const t = buildJobTimeline([
      job({
        id: "a",
        sortOrder: 100,
        startDate: "2026-05-04",
        endDate: "2026-05-08", // Mon → Fri = 4 working days from start, dur 4
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-08",
      }),
      job({
        id: "b",
        sortOrder: 200,
        startDate: "2026-05-11", // Mon next week
        endDate: "2026-05-15",
        originalStartDate: "2026-05-11",
        originalEndDate: "2026-05-15",
      }),
    ]);
    expect(t.jobs[0].planned.offsetFromStart).toBe(0);
    expect(t.jobs[1].planned.offsetFromStart).toBe(5); // 5 working days later
  });

  it("totalWorkingDays spans plotStart → plotEnd in working days", () => {
    const t = buildJobTimeline([
      job({
        id: "first",
        sortOrder: 100,
        startDate: "2026-05-04",
        endDate: "2026-05-08", // Fri
      }),
      job({
        id: "last",
        sortOrder: 900,
        startDate: "2026-05-11",
        endDate: "2026-05-15", // Fri week 2
      }),
    ]);
    // Mon 4 May → Fri 15 May = 9 working days (5 in week 1 + 4 in week 2)
    expect(t.totalWorkingDays).toBe(9);
  });
});

describe("buildJobTimeline — parent/leaf classification", () => {
  it("marks parent jobs (children: { some: {} }) as not isLeaf", () => {
    const t = buildJobTimeline([
      job({ id: "parent", sortOrder: 100 }),
      job({ id: "childA", sortOrder: 110, parentId: "parent" }),
      job({ id: "childB", sortOrder: 120, parentId: "parent" }),
    ]);

    const parent = t.jobs.find((j) => j.id === "parent")!;
    const childA = t.jobs.find((j) => j.id === "childA")!;
    expect(parent.isLeaf).toBe(false);
    expect(childA.isLeaf).toBe(true);
  });

  it("leafJobs / parentJobs convenience arrays partition correctly", () => {
    const t = buildJobTimeline([
      job({ id: "p1", sortOrder: 100 }),
      job({ id: "p1c1", sortOrder: 110, parentId: "p1" }),
      job({ id: "atomic", sortOrder: 200 }),
    ]);
    expect(t.leafJobs.map((j) => j.id).sort()).toEqual(["atomic", "p1c1"]);
    expect(t.parentJobs.map((j) => j.id)).toEqual(["p1"]);
  });

  it("plot anchor uses LEAF jobs only — parent earliest-start can't pull anchor backwards", () => {
    // Parent's planned dates SHOULD already mirror its children's union
    // via recomputeParentFromChildren, but we don't depend on it here.
    // Test: anchor is earliest leaf, even if a parent has an earlier
    // spurious startDate.
    const t = buildJobTimeline([
      job({
        id: "parent",
        sortOrder: 100,
        startDate: "2026-04-27", // a week earlier than children — bug data
        endDate: "2026-05-15",
        originalStartDate: "2026-04-27",
        originalEndDate: "2026-05-15",
      }),
      job({
        id: "childA",
        sortOrder: 110,
        parentId: "parent",
        startDate: "2026-05-04",
        endDate: "2026-05-08",
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-08",
      }),
    ]);
    // Anchor = earliest LEAF startDate = 2026-05-04, not 2026-04-27.
    expect(t.plotStart.toISOString().slice(0, 10)).toBe("2026-05-04");
    // Parent's offset is 0 because the parent is BEFORE the anchor —
    // helper clamps to >= 0 (offsets can never be negative).
    const parent = t.jobs.find((j) => j.id === "parent")!;
    expect(parent.planned.offsetFromStart).toBe(0);
  });
});

describe("buildJobTimeline — three timelines (planned / original / actual)", () => {
  it("returns planned + original both populated, actual null when no work", () => {
    const t = buildJobTimeline([
      job({
        startDate: "2026-05-11",
        endDate: "2026-05-15",
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-08",
      }),
    ]);
    const j = t.jobs[0];
    // planned = current plan (delayed a week from original)
    expect(j.planned.start.toISOString().slice(0, 10)).toBe("2026-05-11");
    // original = baseline
    expect(j.original.start.toISOString().slice(0, 10)).toBe("2026-05-04");
    // actual = null because no work started
    expect(j.actual).toBe(null);
  });

  it("returns partial actual when started but not finished", () => {
    const t = buildJobTimeline([
      job({
        startDate: "2026-05-04",
        endDate: "2026-05-08",
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-08",
        actualStartDate: "2026-05-06",
        actualEndDate: null,
      }),
    ]);
    const j = t.jobs[0];
    expect(j.actual).not.toBe(null);
    expect(j.actual!.start?.toISOString().slice(0, 10)).toBe("2026-05-06");
    expect(j.actual!.end).toBe(null);
    expect(j.actual!.durationDays).toBe(null);
  });

  it("returns full actual when started + finished", () => {
    const t = buildJobTimeline([
      job({
        startDate: "2026-05-04",
        endDate: "2026-05-08",
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-08",
        actualStartDate: "2026-05-04",
        actualEndDate: "2026-05-11",
      }),
    ]);
    const j = t.jobs[0];
    expect(j.actual).not.toBe(null);
    expect(j.actual!.durationDays).toBe(5); // Mon 4 May → Mon 11 May = 5 wd
  });
});

describe("buildJobTimeline — pull-forward + delay scenarios", () => {
  it("after a pull-forward, planned offset is smaller than original offset", () => {
    // Job originally started May 11, pulled forward to May 4
    const t = buildJobTimeline([
      job({
        id: "anchor",
        sortOrder: 50,
        startDate: "2026-05-04",
        endDate: "2026-05-04", // tiny anchor job
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-04",
      }),
      job({
        id: "pulled",
        sortOrder: 100,
        startDate: "2026-05-04",
        endDate: "2026-05-08",
        originalStartDate: "2026-05-11",
        originalEndDate: "2026-05-15",
      }),
    ]);
    const pulled = t.jobs.find((j) => j.id === "pulled")!;
    expect(pulled.planned.offsetFromStart).toBe(0);
    expect(pulled.original.offsetFromStart).toBe(5); // 5 wd later than anchor
  });

  it("after a delay, planned offset is larger than original offset", () => {
    const t = buildJobTimeline([
      job({
        id: "anchor",
        sortOrder: 50,
        startDate: "2026-05-04",
        endDate: "2026-05-04",
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-04",
      }),
      job({
        id: "delayed",
        sortOrder: 100,
        startDate: "2026-05-11",
        endDate: "2026-05-15",
        originalStartDate: "2026-05-04",
        originalEndDate: "2026-05-08",
      }),
    ]);
    const delayed = t.jobs.find((j) => j.id === "delayed")!;
    expect(delayed.planned.offsetFromStart).toBe(5);
    expect(delayed.original.offsetFromStart).toBe(0);
  });
});

describe("buildJobTimeline — legacyTimelineFields shim", () => {
  it("converts a TimelineRange to the legacy { duration, earlyStart, earlyFinish } shape", () => {
    const range = {
      start: new Date("2026-05-04"),
      end: new Date("2026-05-08"),
      durationDays: 4,
      offsetFromStart: 5,
    };
    expect(legacyTimelineFields(range)).toEqual({
      duration: 4,
      earlyStart: 5,
      earlyFinish: 9,
    });
  });
});
