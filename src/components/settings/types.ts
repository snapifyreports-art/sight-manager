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

export interface TemplateOrderData {
  id: string;
  templateJobId: string;
  supplierId: string | null;
  supplier: SupplierData | null;
  itemsDescription: string | null;
  orderWeekOffset: number;
  deliveryWeekOffset: number;
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
  orders: TemplateOrderData[];
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
