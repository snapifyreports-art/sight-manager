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
  weatherAffected: boolean;
  parentId: string | null;
  contactId: string | null;
  contact: { id: string; name: string; company: string | null } | null;
  orders: TemplateOrderData[];
  children: TemplateJobData[];
}

export interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  typeLabel: string | null;
  createdAt: string;
  updatedAt: string;
  jobs: TemplateJobData[];
}
