// Shared Prisma include for PlotTemplate queries
// Fetches only top-level jobs (parentId === null) with nested children.
//
// `variantId: null` filter (May 2026) — variants own their own job tree
// post-rework, so the base template fetch must exclude variant-scoped
// rows. Use `variantJobsInclude(variantId)` below for variant-scoped
// fetches.

export const templateJobsInclude = {
  where: { parentId: null, variantId: null },
  orderBy: { sortOrder: "asc" as const },
  include: {
    children: {
      orderBy: { sortOrder: "asc" as const },
      include: {
        contact: {
          select: { id: true, name: true, company: true },
        },
        orders: {
          include: {
            items: true,
            supplier: true,
            anchorJob: {
              select: { id: true, name: true, startWeek: true, stageCode: true },
            },
          },
        },
      },
    },
    contact: {
      select: { id: true, name: true, company: true },
    },
    orders: {
      include: {
        items: true,
        supplier: true,
        anchorJob: {
          select: { id: true, name: true, startWeek: true, stageCode: true },
        },
      },
    },
  },
};

/**
 * Same shape as templateJobsInclude but scoped to a specific variant.
 * Use when fetching a variant's full template tree for the variant
 * editor or apply-template.
 */
export function variantJobsInclude(variantId: string) {
  return {
    where: { parentId: null, variantId },
    orderBy: { sortOrder: "asc" as const },
    include: {
      children: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          contact: {
            select: { id: true, name: true, company: true },
          },
          orders: {
            include: {
              items: true,
              supplier: true,
              anchorJob: {
                select: {
                  id: true,
                  name: true,
                  startWeek: true,
                  stageCode: true,
                },
              },
            },
          },
        },
      },
      contact: {
        select: { id: true, name: true, company: true },
      },
      orders: {
        include: {
          items: true,
          supplier: true,
          anchorJob: {
            select: {
              id: true,
              name: true,
              startWeek: true,
              stageCode: true,
            },
          },
        },
      },
    },
  };
}

export const templateFullInclude = {
  jobs: templateJobsInclude,
};

/**
 * Parent TemplateJobs have `startWeek` and `endWeek` stored in the DB
 * alongside the same fields on their children — a historical duplication
 * that drifted. At apply-template time the helper already recomputes parent
 * dates from children (src/lib/apply-template-helpers.ts lines 80-85) so
 * the stored parent values are dead data on write.
 *
 * This function normalises a template loaded from Prisma by overwriting
 * every parent's startWeek / endWeek / durationWeeks with the correct
 * values derived from children. Call this right after loading a template
 * anywhere it will be rendered (TemplateEditor, template detail API) so
 * the UI can never show a parent date out of sync with its children.
 *
 * Parents with no children are left alone (they're effectively leaf jobs
 * in the flat / legacy template shape).
 */
interface NormalisableJob {
  startWeek: number;
  endWeek: number;
  durationWeeks?: number | null;
  children?: Array<{ startWeek: number; endWeek: number }>;
}
interface NormalisableTemplate {
  jobs: NormalisableJob[];
}

export function normaliseTemplateParentDates<T extends NormalisableTemplate>(template: T): T {
  for (const job of template.jobs) {
    if (!job.children || job.children.length === 0) continue;
    const starts = job.children.map((c) => c.startWeek);
    const ends = job.children.map((c) => c.endWeek);
    job.startWeek = Math.min(...starts);
    job.endWeek = Math.max(...ends);
    job.durationWeeks = Math.max(1, job.endWeek - job.startWeek + 1);
  }
  return template;
}
