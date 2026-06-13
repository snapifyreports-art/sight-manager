import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  variantJobsInclude,
  normaliseTemplateParentDates,
} from "@/lib/template-includes";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/plot-templates/[id]/variants/[variantId]/full
 *
 * Returns a variant's data shaped like a PlotTemplate so the existing
 * TemplateEditor component can consume it directly. The `id` in the
 * response is the variant's id (so all CRUD endpoints can target it
 * via the standard `?variantId=X` query param), but `name` /
 * `description` / `typeLabel` are the variant's own metadata.
 *
 * The `jobs` collection is variantId-scoped so the editor only sees
 * rows owned by this variant — not the base template's, not sibling
 * variants'.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // (R14) Variant full-content read gated on EDIT_PROGRAMME — matches the
  // variant list + base template reads and the variant mutation verbs.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to view templates" },
      { status: 403 },
    );
  }

  const { id: templateId, variantId } = await params;

  const variant = await prisma.templateVariant.findFirst({
    where: { id: variantId, templateId },
  });
  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const baseTemplate = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
    select: { typeLabel: true, isDraft: true },
  });

  const jobs = await prisma.templateJob.findMany(
    variantJobsInclude(variantId),
  );

  // Shape it like a PlotTemplate so TemplateEditor can render it.
  // (May 2026 critical bug fix) TemplateEditor's apiUrl() reads
  // `template.variantId` to decide whether to scope writes with
  // `?variantId=X`. Pre-fix this field WAS NOT in the response —
  // only `id` (= variant id) + `templateId` (= base id) + `isVariant`.
  // Result: variantId was always undefined, apiUrl returned base
  // URLs, and EVERY edit inside the variant editor (rename, add
  // sub-job, add order, change material) silently mutated the BASE
  // template. Variants have been silently corrupting the base since
  // the variants rework. Emitting `variantId` here makes apiUrl
  // scope correctly without touching the consumer.
  const shaped = {
    id: variant.id,
    templateId: templateId,
    variantId: variant.id,
    name: variant.name,
    description: variant.description,
    typeLabel: baseTemplate?.typeLabel ?? null,
    isDraft: baseTemplate?.isDraft ?? false,
    isVariant: true,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
    jobs,
    variants: [],
  };

  return NextResponse.json(normaliseTemplateParentDates(shaped));
}
