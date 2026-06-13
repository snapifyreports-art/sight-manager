import type { Prisma, InspectionType } from "@prisma/client";

/**
 * (R16/R17) Shared template-scope copy helper.
 *
 * Both the clone route (template → new template) and the variant-seed
 * route (scope → variant) deep-copy the same five row types — jobs (with
 * parent/child relations), orders + order items, materials, documents,
 * and inspections — remapping anchor references onto the freshly-created
 * job IDs. This function is the single source of truth for that copy so
 * the clone-with-variants path and the seed path can never drift.
 *
 * It reads the SOURCE rows from `args.source` and writes copies into the
 * target `templateId` (+ optional `variantId`) using the supplied
 * transaction client. Returns the old-job-id → new-job-id map so the
 * caller can chain further copies (e.g. variant docs that reference jobs).
 */

type Tx = Prisma.TransactionClient;

interface SourceOrderItem {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface SourceOrder {
  templateJobId: string;
  // (schema) TemplateOrder.supplierId is nullable.
  supplierId: string | null;
  orderWeekOffset: number;
  deliveryWeekOffset: number;
  itemsDescription: string | null;
  anchorType: string | null;
  anchorAmount: number | null;
  anchorUnit: string | null;
  anchorDirection: string | null;
  anchorJobId: string | null;
  leadTimeAmount: number | null;
  leadTimeUnit: string | null;
  items: SourceOrderItem[];
}

interface SourceJob {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  stageCode: string | null;
  // (schema) startWeek/endWeek are non-null Int.
  startWeek: number;
  endWeek: number;
  durationWeeks: number | null;
  durationDays: number | null;
  sortOrder: number;
  weatherAffected: boolean;
  weatherAffectedType: string | null;
  contactId: string | null;
  orders: SourceOrder[];
}

interface SourceMaterial {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  linkedStageCode: string | null;
  category: string | null;
  notes: string | null;
}

interface SourceDocument {
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  isPlaceholder: boolean;
}

interface SourceInspection {
  name: string;
  type: InspectionType;
  description: string | null;
  sortOrder: number;
  anchorTemplateJobId: string;
  anchorEdge: string;
  offsetDays: number;
  bookingLeadWeeks: number | null;
  defaultInspectorContactId: string | null;
  isBlocking: boolean;
}

export interface TemplateScopeSource {
  jobs: SourceJob[];
  materials: SourceMaterial[];
  documents: SourceDocument[];
  inspections: SourceInspection[];
}

export interface CopyTemplateScopeArgs {
  tx: Tx;
  /** Target template id every copied row attaches to. */
  templateId: string;
  /** Target variant id, or null for base-scoped rows. */
  variantId: string | null;
  source: TemplateScopeSource;
  /**
   * (R17) How to copy documents:
   *   - "reference" → keep the source url + fileName, isPlaceholder=false.
   *     The same Supabase object is shared (no duplication, no re-upload).
   *   - "placeholder" → legacy behaviour: empty url, isPlaceholder=true,
   *     UI prompts a manual re-upload.
   */
  documentMode: "reference" | "placeholder";
}

export interface CopyTemplateScopeResult {
  jobIdMap: Map<string, string>;
  jobs: number;
  orders: number;
  materials: number;
  documents: number;
  inspections: number;
}

export async function copyTemplateScope(
  args: CopyTemplateScopeArgs,
): Promise<CopyTemplateScopeResult> {
  const { tx, templateId, variantId, source, documentMode } = args;
  const jobIdMap = new Map<string, string>();

  // Jobs — parents first so child parentId can be remapped.
  for (const job of source.jobs.filter((j) => j.parentId === null)) {
    const created = await tx.templateJob.create({
      data: {
        templateId,
        variantId,
        name: job.name,
        description: job.description,
        stageCode: job.stageCode,
        startWeek: job.startWeek,
        endWeek: job.endWeek,
        durationWeeks: job.durationWeeks,
        durationDays: job.durationDays,
        sortOrder: job.sortOrder,
        weatherAffected: job.weatherAffected,
        weatherAffectedType: job.weatherAffectedType,
        contactId: job.contactId,
        parentId: null,
      },
    });
    jobIdMap.set(job.id, created.id);
  }
  for (const job of source.jobs.filter((j) => j.parentId !== null)) {
    const newParentId = job.parentId ? jobIdMap.get(job.parentId) ?? null : null;
    const created = await tx.templateJob.create({
      data: {
        templateId,
        variantId,
        name: job.name,
        description: job.description,
        stageCode: job.stageCode,
        startWeek: job.startWeek,
        endWeek: job.endWeek,
        durationWeeks: job.durationWeeks,
        durationDays: job.durationDays,
        sortOrder: job.sortOrder,
        weatherAffected: job.weatherAffected,
        weatherAffectedType: job.weatherAffectedType,
        contactId: job.contactId,
        parentId: newParentId,
      },
    });
    jobIdMap.set(job.id, created.id);
  }

  // Orders (remap templateJobId + anchorJobId, copy items + lead times).
  let orderCount = 0;
  for (const job of source.jobs) {
    for (const order of job.orders) {
      const newJobId = jobIdMap.get(order.templateJobId);
      if (!newJobId) continue;
      const newAnchorJobId = order.anchorJobId
        ? jobIdMap.get(order.anchorJobId) ?? null
        : null;
      await tx.templateOrder.create({
        data: {
          templateJobId: newJobId,
          supplierId: order.supplierId,
          orderWeekOffset: order.orderWeekOffset,
          deliveryWeekOffset: order.deliveryWeekOffset,
          itemsDescription: order.itemsDescription,
          anchorType: order.anchorType,
          anchorAmount: order.anchorAmount,
          anchorUnit: order.anchorUnit,
          anchorDirection: order.anchorDirection,
          anchorJobId: newAnchorJobId,
          leadTimeAmount: order.leadTimeAmount,
          leadTimeUnit: order.leadTimeUnit,
          items: {
            create: order.items.map((it) => ({
              name: it.name,
              quantity: it.quantity,
              unit: it.unit,
              unitCost: it.unitCost,
            })),
          },
        },
      });
      orderCount += 1;
    }
  }

  // Materials (flat — no remap).
  for (const m of source.materials) {
    await tx.templateMaterial.create({
      data: {
        templateId,
        variantId,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        unitCost: m.unitCost,
        category: m.category,
        notes: m.notes,
        linkedStageCode: m.linkedStageCode,
      },
    });
  }

  // Documents — by-reference (share the storage object) or placeholder.
  for (const d of source.documents) {
    await tx.templateDocument.create({
      data: {
        templateId,
        variantId,
        name: d.name,
        url: documentMode === "reference" ? d.url : "",
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        category: d.category,
        isPlaceholder: documentMode === "reference" ? false : true,
      },
    });
  }

  // Inspections (remap each anchor; skip any whose anchor didn't copy).
  let inspectionCount = 0;
  for (const ins of source.inspections) {
    const newAnchorId = jobIdMap.get(ins.anchorTemplateJobId);
    if (!newAnchorId) continue;
    await tx.templateInspection.create({
      data: {
        templateId,
        variantId,
        name: ins.name,
        type: ins.type,
        description: ins.description,
        sortOrder: ins.sortOrder,
        anchorTemplateJobId: newAnchorId,
        anchorEdge: ins.anchorEdge,
        offsetDays: ins.offsetDays,
        bookingLeadWeeks: ins.bookingLeadWeeks,
        defaultInspectorContactId: ins.defaultInspectorContactId,
        isBlocking: ins.isBlocking,
      },
    });
    inspectionCount += 1;
  }

  return {
    jobIdMap,
    jobs: jobIdMap.size,
    orders: orderCount,
    materials: source.materials.length,
    documents: source.documents.length,
    inspections: inspectionCount,
  };
}
