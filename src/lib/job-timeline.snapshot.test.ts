import { describe, it, expect } from "vitest";
import { buildJobTimeline, type TimelineJobInput } from "./job-timeline";

/**
 * Snapshot test pinning the canonical timeline against a realistic
 * 2-Storey plot (the kind of data Keith's actually working with).
 *
 * If this snapshot changes, treat it as load-bearing. Either:
 *   (a) The helper changed behavior intentionally — bump the snapshot
 *       and verify every consumer still renders correctly, OR
 *   (b) Someone broke the helper. Fix the helper, don't bump the
 *       snapshot.
 *
 * Update with: `npx vitest run --update`
 */

// Realistic plot fixture — 2-storey house, plot start Mon 4 May 2026.
// Foundation parent + 5 children, then Superstructure parent + 2
// children, then a single atomic Final stage. Some delays + actuals
// already recorded so the three timelines all populate non-trivially.
const FIXTURE: TimelineJobInput[] = [
  // ── Foundation stage (parent + 5 children)
  {
    id: "p-foundation",
    name: "Foundation",
    status: "COMPLETED",
    sortOrder: 100,
    parentId: null,
    parentStage: null,
    stageCode: "FEN",
    startDate: "2026-05-04",
    endDate: "2026-06-05",
    originalStartDate: "2026-05-04",
    originalEndDate: "2026-05-29",
    actualStartDate: "2026-05-04",
    actualEndDate: "2026-06-05",
  },
  {
    id: "c-dig",
    name: "Dig & pour",
    status: "COMPLETED",
    sortOrder: 101,
    parentId: "p-foundation",
    parentStage: "Foundation",
    stageCode: "DIG",
    startDate: "2026-05-04",
    endDate: "2026-05-22",
    originalStartDate: "2026-05-04",
    originalEndDate: "2026-05-15",
    actualStartDate: "2026-05-04",
    actualEndDate: "2026-05-22",
  },
  {
    id: "c-drainage",
    name: "Drainage",
    status: "COMPLETED",
    sortOrder: 102,
    parentId: "p-foundation",
    parentStage: "Foundation",
    stageCode: "DRA",
    startDate: "2026-05-25",
    endDate: "2026-05-28",
    originalStartDate: "2026-05-18",
    originalEndDate: "2026-05-21",
    actualStartDate: "2026-05-25",
    actualEndDate: "2026-05-28",
  },
  {
    id: "c-spantherm",
    name: "Spantherm",
    status: "COMPLETED",
    sortOrder: 103,
    parentId: "p-foundation",
    parentStage: "Foundation",
    stageCode: "SPA",
    startDate: "2026-05-29",
    endDate: "2026-05-29",
    originalStartDate: "2026-05-22",
    originalEndDate: "2026-05-22",
    actualStartDate: "2026-05-29",
    actualEndDate: "2026-05-29",
  },
  {
    id: "c-slab",
    name: "Concrete slab",
    status: "COMPLETED",
    sortOrder: 104,
    parentId: "p-foundation",
    parentStage: "Foundation",
    stageCode: "SLB",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    originalStartDate: "2026-05-25",
    originalEndDate: "2026-05-25",
    actualStartDate: "2026-06-01",
    actualEndDate: "2026-06-01",
  },
  {
    id: "c-final",
    name: "Final",
    status: "COMPLETED",
    sortOrder: 105,
    parentId: "p-foundation",
    parentStage: "Foundation",
    stageCode: "FIN",
    startDate: "2026-06-04",
    endDate: "2026-06-05",
    originalStartDate: "2026-05-28",
    originalEndDate: "2026-05-29",
    actualStartDate: "2026-06-04",
    actualEndDate: "2026-06-05",
  },

  // ── Superstructure stage (parent + 2 children, in progress)
  {
    id: "p-super",
    name: "Superstructure",
    status: "IN_PROGRESS",
    sortOrder: 200,
    parentId: null,
    parentStage: null,
    stageCode: "SUP",
    startDate: "2026-06-08",
    endDate: "2026-08-14",
    originalStartDate: "2026-06-01",
    originalEndDate: "2026-08-07",
    actualStartDate: "2026-06-08",
    actualEndDate: null,
  },
  {
    id: "c-brick1",
    name: "Brickwork 1st lift",
    status: "IN_PROGRESS",
    sortOrder: 201,
    parentId: "p-super",
    parentStage: "Superstructure",
    stageCode: "BR1",
    startDate: "2026-06-08",
    endDate: "2026-06-10",
    originalStartDate: "2026-06-01",
    originalEndDate: "2026-06-03",
    actualStartDate: "2026-06-08",
    actualEndDate: null,
  },
  {
    id: "c-scaff1",
    name: "Scaff 1st",
    status: "NOT_STARTED",
    sortOrder: 202,
    parentId: "p-super",
    parentStage: "Superstructure",
    stageCode: "SC1",
    startDate: "2026-06-11",
    endDate: "2026-06-11",
    originalStartDate: "2026-06-04",
    originalEndDate: "2026-06-04",
    actualStartDate: null,
    actualEndDate: null,
  },

  // ── Atomic Final stage (no children)
  {
    id: "atom-handover",
    name: "Handover",
    status: "NOT_STARTED",
    sortOrder: 900,
    parentId: null,
    parentStage: null,
    stageCode: "HND",
    startDate: "2026-08-17",
    endDate: "2026-08-21",
    originalStartDate: "2026-08-10",
    originalEndDate: "2026-08-14",
    actualStartDate: null,
    actualEndDate: null,
  },
];

describe("job-timeline snapshot — realistic 2-storey plot", () => {
  it("matches the canonical output for the fixture", () => {
    const timeline = buildJobTimeline(FIXTURE);

    // Stringify dates so the snapshot is human-readable + stable across
    // platform timezone diffs. Keep all the structure, just ISO-string
    // every Date.
    const toISO = (d: Date | null) =>
      d == null ? null : d.toISOString().slice(0, 10);

    const serializable = {
      plotStart: toISO(timeline.plotStart),
      plotEnd: toISO(timeline.plotEnd),
      totalWorkingDays: timeline.totalWorkingDays,
      jobs: timeline.jobs.map((j) => ({
        id: j.id,
        name: j.name,
        sortOrder: j.sortOrder,
        isLeaf: j.isLeaf,
        parentStage: j.parentStage,
        status: j.status,
        planned: {
          start: toISO(j.planned.start),
          end: toISO(j.planned.end),
          durationDays: j.planned.durationDays,
          offsetFromStart: j.planned.offsetFromStart,
        },
        original: {
          start: toISO(j.original.start),
          end: toISO(j.original.end),
          durationDays: j.original.durationDays,
          offsetFromStart: j.original.offsetFromStart,
        },
        actual: j.actual && {
          start: toISO(j.actual.start),
          end: toISO(j.actual.end),
          durationDays: j.actual.durationDays,
          offsetFromStart: j.actual.offsetFromStart,
        },
      })),
    };

    expect(serializable).toMatchSnapshot();
  });
});
