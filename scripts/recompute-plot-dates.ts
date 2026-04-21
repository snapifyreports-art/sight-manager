/**
 * One-off repair — recompute plot job dates so they obey the new invariants.
 *
 * Problem: plots created before this session got dates from the OLD
 * apply-template logic, which:
 *   - Didn't always snap to working days (we've seen Sunday starts)
 *   - Positioned each child independently from its startWeek, allowing
 *     overlap or gaps — and a parent whose startDate could end up
 *     different from min(children.startDate)
 *
 * This script walks every plot and, for every NOT_STARTED parent group,
 * re-lays the children sequentially starting from the earliest child's
 * current snapped startDate. Each child preserves its own working-day
 * duration (end - start + 1 WD). The parent is then re-derived as
 * min(children.start) → max(children.end).
 *
 * Safe-by-design:
 *   - COMPLETED / IN_PROGRESS / ON_HOLD jobs are LEFT UNTOUCHED.
 *   - Plots with zero not-started jobs are skipped.
 *   - Dry-run by default. Pass `--apply` to actually write.
 *   - Per-plot summary shows the diff before writing.
 */

import { PrismaClient } from "@prisma/client";
import { addWorkingDays, differenceInWorkingDays, snapToWorkingDay } from "../src/lib/working-days";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

type JobRow = {
  id: string;
  name: string;
  sortOrder: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  parentId: string | null;
};

function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function workingDayDurationOf(start: Date | null, end: Date | null): number {
  if (!start || !end) return 5; // fallback: one working week
  const wd = differenceInWorkingDays(end, start) + 1;
  return Math.max(1, wd);
}

async function main() {
  console.log(`━━━ Recompute plot dates ${APPLY ? "(APPLYING)" : "(DRY RUN — pass --apply to write)"} ━━━\n`);

  const plots = await prisma.plot.findMany({
    select: { id: true, name: true, plotNumber: true, site: { select: { name: true } } },
    orderBy: [{ site: { name: "asc" } }, { plotNumber: "asc" }],
  });

  let plotsTouched = 0;
  let jobsTouched = 0;
  let parentsTouched = 0;

  for (const plot of plots) {
    const jobs = (await prisma.job.findMany({
      where: { plotId: plot.id },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        startDate: true,
        endDate: true,
        status: true,
        parentId: true,
      },
      orderBy: { sortOrder: "asc" },
    })) as JobRow[];

    if (jobs.length === 0) continue;

    // Group children by parentId. Top-level jobs go into group "__root__".
    const byParent = new Map<string, JobRow[]>();
    for (const j of jobs) {
      const key = j.parentId ?? "__root__";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(j);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    const updates: Array<{ id: string; name: string; oldStart: Date | null; oldEnd: Date | null; newStart: Date; newEnd: Date }> = [];

    // Walk every parent (jobs with children under them). Lay children
    // sequentially; each child snaps forward and cascades.
    const parents = jobs.filter((j) => byParent.has(j.id));
    for (const parent of parents) {
      const children = byParent.get(parent.id)!;
      if (children.length === 0) continue;

      // Anchor = earliest of (parent's current startDate, first child's
      // current startDate) snapped forward. If both null, skip.
      const candidates = [
        parent.startDate,
        children[0].startDate,
      ].filter((d): d is Date => !!d);
      if (candidates.length === 0) continue;
      const rawAnchor = new Date(Math.min(...candidates.map((d) => d.getTime())));
      let cursor = snapToWorkingDay(rawAnchor, "forward");

      const childNewWindows: Array<{ id: string; newStart: Date; newEnd: Date }> = [];
      for (const child of children) {
        // LOCKED children keep their current dates (acts as an anchor).
        if (child.status !== "NOT_STARTED") {
          if (child.startDate && child.endDate) {
            childNewWindows.push({ id: child.id, newStart: child.startDate, newEnd: child.endDate });
            // Cursor jumps to end-of-locked + 1 WD so subsequent
            // children still cascade after it.
            cursor = addWorkingDays(child.endDate, 1);
          }
          continue;
        }
        const duration = workingDayDurationOf(child.startDate, child.endDate);
        const newStart = snapToWorkingDay(cursor, "forward");
        const newEnd = addWorkingDays(newStart, duration - 1);
        childNewWindows.push({ id: child.id, newStart, newEnd });
        cursor = addWorkingDays(newEnd, 1);

        if (!child.startDate || !child.endDate ||
            child.startDate.getTime() !== newStart.getTime() ||
            child.endDate.getTime() !== newEnd.getTime()) {
          updates.push({
            id: child.id,
            name: child.name,
            oldStart: child.startDate,
            oldEnd: child.endDate,
            newStart,
            newEnd,
          });
        }
      }

      // Re-derive parent span. Only updates the parent if it's NOT_STARTED
      // (in-progress / completed parents keep their dates as audit points).
      if (parent.status === "NOT_STARTED" && childNewWindows.length > 0) {
        const parentNewStart = new Date(Math.min(...childNewWindows.map((w) => w.newStart.getTime())));
        const parentNewEnd = new Date(Math.max(...childNewWindows.map((w) => w.newEnd.getTime())));
        if (!parent.startDate || !parent.endDate ||
            parent.startDate.getTime() !== parentNewStart.getTime() ||
            parent.endDate.getTime() !== parentNewEnd.getTime()) {
          updates.push({
            id: parent.id,
            name: `[parent] ${parent.name}`,
            oldStart: parent.startDate,
            oldEnd: parent.endDate,
            newStart: parentNewStart,
            newEnd: parentNewEnd,
          });
        }
      }
    }

    if (updates.length === 0) continue;

    plotsTouched++;
    const prefix = `${plot.site.name} › Plot ${plot.plotNumber ?? plot.name}`;
    console.log(`\n${prefix}  (${updates.length} changes)`);
    for (const u of updates) {
      const isParent = u.name.startsWith("[parent]");
      if (isParent) parentsTouched++;
      else jobsTouched++;
      console.log(`  • ${u.name.padEnd(40)}  ${iso(u.oldStart)} → ${iso(u.oldEnd)}   →   ${iso(u.newStart)} → ${iso(u.newEnd)}`);
    }

    if (APPLY) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.job.update({
            where: { id: u.id },
            data: { startDate: u.newStart, endDate: u.newEnd },
          })
        )
      );
    }
  }

  console.log(`\n━━━ Summary ━━━`);
  console.log(`Plots touched: ${plotsTouched}`);
  console.log(`Leaf jobs touched: ${jobsTouched}`);
  console.log(`Parent jobs re-derived: ${parentsTouched}`);
  if (!APPLY) {
    console.log(`\n(Dry run — re-run with --apply to write changes.)`);
  } else {
    console.log(`\n✓ Applied.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
