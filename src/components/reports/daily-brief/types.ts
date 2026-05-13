/**
 * Type definitions for the DailySiteBrief module.
 *
 * (May 2026 sprint 7a) Extracted from the monolithic
 * `DailySiteBrief.tsx` so individual section components can import
 * just the data shapes they need without pulling in the whole 3,600-
 * line file.
 *
 * `BriefData` is what `GET /api/sites/[id]/daily-brief` returns —
 * the SSOT response shape for the entire daily-brief view. Keep this
 * file in lock-step with the route handler; a mismatch surfaces as a
 * TS error at the section render site.
 */

export interface DailySiteBriefProps {
  siteId: string;
}

export interface BriefData {
  site: { name: string; address: string | null; postcode: string | null };
  date: string;
  isRainedOff: boolean;
  rainedOffNote: string | null;
  summary: {
    totalPlots: number;
    totalJobs: number;
    completedJobs: number;
    progressPercent: number;
    activeJobCount: number;
    overdueJobCount: number;
    lateStartCount: number;
    blockedCount: number;
    openSnagCount: number;
    inactivePlotCount: number;
    pendingSignOffCount?: number;
  };
  inactivePlots?: Array<{
    id: string;
    plotNumber: string | null;
    name: string;
    houseType: string | null;
    inactivityType: string;
    label: string;
    nextJob: {
      id: string;
      name: string;
      startDate: string | null;
      endDate: string | null;
      contractorName: string | null;
      contractorPhone: string | null;
      contractorEmail: string | null;
      assignedToName: string | null;
    } | null;
    hasContractor?: boolean;
    ordersPending?: number;
    ordersOrdered?: number;
    ordersTotal?: number;
  }>;
  // Legacy — kept for backward compat
  awaitingRestartPlots?: Array<{
    id: string;
    plotNumber: string | null;
    name: string;
    nextJob: {
      id: string;
      name: string;
      startDate: string | null;
      contractorName: string | null;
      assignedToName: string | null;
    } | null;
  }>;
  delayedJobs?: Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    originalStartDate: string | null;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{
      contact: { id: string; name: string; company: string | null };
    }>;
  }>;
  // (#187) Blocked jobs carry the blocker's id + status so the row
  // can link directly to the blocking job and label its state.
  blockedJobs: Array<{
    blockedById?: string;
    blockedByStatus?: string;
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    blockedBy: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  lateStartJobs: Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    plotId?: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{
      contact: { id: string; name: string; company: string | null };
    }>;
  }>;
  jobsStartingToday: Array<{
    id: string;
    name: string;
    status: string;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{
      contact: { id: string; name: string; company: string | null };
    }>;
    readiness?: {
      hasContractor: boolean;
      hasAssignee: boolean;
      predecessorComplete: boolean;
      ordersPending: number;
      ordersOrdered: number;
      ordersDelivered: number;
      ordersTotal: number;
      pendingOrdersList?: Array<{
        id: string;
        description: string | null;
        supplierName: string;
        supplierEmail: string | null;
      }>;
    };
  }>;
  jobsDueToday: Array<{
    id: string;
    name: string;
    status: string;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    orders?: Array<{ id: string; status: string }>;
  }>;
  overdueJobs: Array<{
    id: string;
    name: string;
    status: string;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  activeJobs: Array<{
    id: string;
    name: string;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  deliveriesToday: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    supplier: { id: string; name: string };
    job: {
      id: string;
      name: string;
      plot: { plotNumber: string | null; name: string };
    };
  }>;
  overdueDeliveries: Array<{
    id: string;
    itemsDescription: string | null;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string };
    job: {
      id: string;
      name: string;
      plot: { plotNumber: string | null; name: string };
    };
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name: string } | null;
  }>;
  openSnagsList: Array<{
    id: string;
    description: string;
    status: string;
    priority: string;
    location: string | null;
    plotId: string;
    plot: { plotNumber: string | null; name: string; siteId: string };
    assignedTo: { name: string } | null;
    contact: { name: string; company: string | null } | null;
  }>;
  openSnagsTruncated: boolean;
  ordersToPlace: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    supplier: {
      id: string;
      name: string;
      contactEmail: string | null;
      contactName: string | null;
      accountNumber: string | null;
    };
    job: {
      id: string;
      name: string;
      plot: { plotNumber: string | null; name: string };
    };
    orderItems: Array<{
      id: string;
      name: string;
      quantity: number;
      unit: string;
      unitCost: number;
      totalCost: number;
    }>;
  }>;
  upcomingOrders: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    supplier: {
      id: string;
      name: string;
      contactEmail: string | null;
      contactName: string | null;
      accountNumber: string | null;
    };
    job: {
      id: string;
      name: string;
      plot: { plotNumber: string | null; name: string };
    };
    orderItems: Array<{
      id: string;
      name: string;
      quantity: number;
      unit: string;
      unitCost: number;
      totalCost: number;
    }>;
  }>;
  upcomingDeliveries: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    dateOfOrder: string;
    expectedDeliveryDate: string | null;
    supplier: { id: string; name: string };
    job: {
      id: string;
      name: string;
      plot: { plotNumber: string | null; name: string };
    };
  }>;
  jobsStartingTomorrow: Array<{
    id: string;
    name: string;
    status: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{
      contact: { id: string; name: string; company: string | null };
    }>;
  }>;
  needsAttention: Array<{
    id: string;
    type: "snag" | "job" | "order";
    title: string;
    subtitle: string;
    missing: string[];
  }>;
  pendingSignOffs?: Array<{
    id: string;
    name: string;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
  }>;
  weather: {
    today: {
      date: string;
      category: string;
      tempMax: number;
      tempMin: number;
    };
    forecast: Array<{
      date: string;
      category: string;
      tempMax: number;
      tempMin: number;
    }>;
  } | null;
  awaitingSignOff?: Array<{
    id: string;
    name: string;
    status: string;
    actualEndDate: string | null;
    plotId: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{
      contact: { id: string; name: string; company: string | null };
    }>;
  }>;
}

/**
 * Convenience aliases for the row types each section renders.
 * Sections receive an array slice of BriefData and shouldn't need to
 * import the full union — these short names make section signatures
 * readable.
 */
export type StartingTodayJob = BriefData["jobsStartingToday"][number];
export type LateStartJob = BriefData["lateStartJobs"][number];
export type BlockedJob = BriefData["blockedJobs"][number];
export type OverdueJob = BriefData["overdueJobs"][number];
export type ActiveJob = BriefData["activeJobs"][number];
export type DelayedJob = NonNullable<BriefData["delayedJobs"]>[number];
export type AwaitingSignOffJob = NonNullable<BriefData["awaitingSignOff"]>[number];
export type DeliveryToday = BriefData["deliveriesToday"][number];
export type OverdueDelivery = BriefData["overdueDeliveries"][number];
export type OrderToPlace = BriefData["ordersToPlace"][number];
export type UpcomingOrder = BriefData["upcomingOrders"][number];
export type UpcomingDelivery = BriefData["upcomingDeliveries"][number];
export type OpenSnag = BriefData["openSnagsList"][number];
export type InactivePlot = NonNullable<BriefData["inactivePlots"]>[number];
export type StartingTomorrowJob = BriefData["jobsStartingTomorrow"][number];
export type NeedsAttentionItem = BriefData["needsAttention"][number];
export type PendingSignOffJob = NonNullable<BriefData["pendingSignOffs"]>[number];
export type RecentEvent = BriefData["recentEvents"][number];
