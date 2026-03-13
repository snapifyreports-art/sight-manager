// Shared Prisma include for PlotTemplate queries
// Fetches only top-level jobs (parentId === null) with nested children

export const templateJobsInclude = {
  where: { parentId: null },
  orderBy: { sortOrder: "asc" as const },
  include: {
    children: {
      orderBy: { sortOrder: "asc" as const },
      include: {
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

export const templateFullInclude = {
  jobs: templateJobsInclude,
};
