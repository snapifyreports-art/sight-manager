/**
 * Tree-walk helpers for the TemplateEditor — find a job or order by
 * id across the parent → child → grandchild hierarchy.
 *
 * (May 2026 sprint 7c) Extracted from TemplateEditor.tsx. Both
 * functions are pure recursion; used primarily by the validation
 * drill-in actions ("Fix: missing contractor on stage X" → scroll
 * to that stage card → highlight the missing field).
 */

import type { TemplateJobData, TemplateOrderData } from "../types";

export function findJobById(
  jobs: TemplateJobData[],
  id: string,
): TemplateJobData | null {
  for (const j of jobs) {
    if (j.id === id) return j;
    if (j.children) {
      const found = findJobById(j.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function findOrderById(
  jobs: TemplateJobData[],
  id: string,
): TemplateOrderData | null {
  for (const j of jobs) {
    for (const o of j.orders ?? []) if (o.id === id) return o;
    if (j.children) {
      const found = findOrderById(j.children, id);
      if (found) return found;
    }
  }
  return null;
}

export interface MaterialSuggestion {
  name: string;
  unit: string;
  unitCost: number;
}
