export interface TemplateOrderItemData {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface SupplierData {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactNumber: string | null;
  type: string | null;
}

export interface AnchorJobData {
  id: string;
  name: string;
  startWeek: number;
  stageCode: string | null;
}

export interface TemplateOrderData {
  id: string;
  templateJobId: string;
  supplierId: string | null;
  supplier: SupplierData | null;
  itemsDescription: string | null;
  orderWeekOffset: number;
  deliveryWeekOffset: number;
  anchorType: string | null;
  anchorAmount: number | null;
  anchorUnit: string | null;
  anchorDirection: string | null;
  anchorJobId: string | null;
  anchorJob: AnchorJobData | null;
  leadTimeAmount: number | null;
  leadTimeUnit: string | null;
  items: TemplateOrderItemData[];
}

export interface TemplateJobData {
  id: string;
  templateId: string;
  name: string;
  description: string | null;
  stageCode: string | null;
  sortOrder: number;
  startWeek: number;
  endWeek: number;
  durationWeeks: number | null;
  /** Optional days-granularity override — takes precedence over durationWeeks
   *  at apply-template time. Null on legacy weeks-only templates. */
  durationDays: number | null;
  weatherAffected: boolean;
  weatherAffectedType: "RAIN" | "TEMPERATURE" | "BOTH" | null;
  parentId: string | null;
  contactId: string | null;
  contact: { id: string; name: string; company: string | null } | null;
  orders: TemplateOrderData[];
  children: TemplateJobData[];
}

export interface TemplateVariantData {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  jobOverrides: Array<{
    id: string;
    templateJobId: string;
    durationDays: number | null;
  }>;
  materialOverrides: Array<{
    id: string;
    templateMaterialId: string;
    quantity: number | null;
    unitCost: number | null;
  }>;
}

export interface TemplateAuditEventData {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  typeLabel: string | null;
  /** Draft templates are hidden from the apply-to-plot picker. */
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  jobs: TemplateJobData[];
  variants?: TemplateVariantData[];
  /** Populated by the detail endpoint — count of Plots that were
   *  created from this template (snapshot link, no auto-sync). */
  _count?: { sourcedPlots: number };
}
