import { format } from "date-fns";

export interface OrderEmailItem {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface OrderEmailParams {
  supplierName: string;
  supplierContactName: string | null;
  supplierAccountNumber?: string | null;
  jobName: string;
  siteName: string;
  siteAddress?: string | null;
  sitePostcode?: string | null;
  plotNumbers: string[]; // e.g. ["Plot 1", "Plot 2", "Plot 3"]
  items: OrderEmailItem[];
  itemsDescriptionFallback?: string | null;
  expectedDeliveryDate: string | null;
  orderDate?: string | null;
  urgentDelivery?: boolean; // adds "ASAP delivery required" messaging
}

/**
 * Build a professional plain-text email body for a supplier material order.
 */
export function buildOrderEmailBody(params: OrderEmailParams): string {
  const {
    supplierContactName,
    supplierName,
    supplierAccountNumber,
    jobName,
    siteName,
    siteAddress,
    sitePostcode,
    plotNumbers,
    items,
    itemsDescriptionFallback,
    expectedDeliveryDate,
    orderDate,
  } = params;

  const greeting = `Hi ${supplierContactName || supplierName},`;
  const plotCount = plotNumbers.length;

  // Site & delivery details
  const lines: string[] = [greeting, ""];
  if (params.urgentDelivery) {
    lines.push(`URGENT — We require the following materials as soon as possible. Please confirm earliest available delivery date.`);
  } else {
    lines.push(`Please supply the following materials as detailed below.`);
  }
  lines.push("");

  // Order header
  lines.push("ORDER DETAILS");
  lines.push("─".repeat(50));
  lines.push(`Job:       ${jobName}`);
  lines.push(`Site:      ${siteName}`);
  if (siteAddress) lines.push(`Address:   ${siteAddress}`);
  if (sitePostcode) lines.push(`Postcode:  ${sitePostcode}`);
  lines.push(`Plot${plotCount > 1 ? "s" : ""}:     ${plotNumbers.join(", ")}`);
  if (supplierAccountNumber) lines.push(`Account:   ${supplierAccountNumber}`);
  if (orderDate) lines.push(`Order Date: ${format(new Date(orderDate), "dd MMM yyyy")}`);
  if (expectedDeliveryDate) lines.push(`Required:  ${format(new Date(expectedDeliveryDate), "dd MMM yyyy")}`);
  lines.push("");

  // Items table
  if (items.length > 0) {
    lines.push("ITEMS REQUIRED");
    lines.push("─".repeat(50));

    // Calculate column widths
    const nameWidth = Math.max(20, ...items.map((i) => i.name.length)) + 2;

    // Header
    const header = [
      "Item".padEnd(nameWidth),
      "Qty".padStart(8),
      "Unit".padStart(8),
      "Unit Cost".padStart(10),
      "Total".padStart(12),
    ].join(" ");
    lines.push(header);
    lines.push("─".repeat(header.length));

    // Rows
    let subtotal = 0;
    for (const item of items) {
      const lineTotal = item.quantity * item.unitCost;
      subtotal += lineTotal;
      const row = [
        item.name.padEnd(nameWidth),
        String(item.quantity).padStart(8),
        item.unit.padStart(8),
        item.unitCost > 0 ? `£${item.unitCost.toFixed(2)}`.padStart(10) : "-".padStart(10),
        lineTotal > 0 ? `£${lineTotal.toFixed(2)}`.padStart(12) : "-".padStart(12),
      ].join(" ");
      lines.push(row);
    }

    lines.push("─".repeat(header.length));

    if (subtotal > 0) {
      if (plotCount > 1) {
        lines.push(`${"Subtotal per plot:".padEnd(nameWidth + 18)} ${`£${subtotal.toFixed(2)}`.padStart(12)}`);
        const grandTotal = subtotal * plotCount;
        lines.push(`${`Total (×${plotCount} plots):`.padEnd(nameWidth + 18)} ${`£${grandTotal.toFixed(2)}`.padStart(12)}`);
      } else {
        lines.push(`${"Total:".padEnd(nameWidth + 18)} ${`£${subtotal.toFixed(2)}`.padStart(12)}`);
      }
    }
  } else if (itemsDescriptionFallback) {
    lines.push("ITEMS REQUIRED");
    lines.push("─".repeat(50));
    lines.push(itemsDescriptionFallback);
  }

  lines.push("");
  lines.push("Please confirm receipt and expected delivery date.");
  lines.push("");
  lines.push("Regards");

  return lines.join("\n");
}

/**
 * Build a full mailto: URI for a supplier order email.
 */
export function buildOrderMailto(
  supplierEmail: string,
  params: OrderEmailParams
): string {
  const plotCount = params.plotNumbers.length;
  const subject = `Material Order — ${params.jobName} — ${params.siteName}${plotCount > 1 ? ` (${plotCount} plots)` : ""}`;
  const body = buildOrderEmailBody(params);
  return `mailto:${encodeURIComponent(supplierEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
