import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { copyTemplateScope } from "@/lib/template-clone";

export const dynamic = "force-dynamic";

/**
 * POST /api/plot-templates/[id]/clone
 * Body: {
 *   name?: string,             — default: "<Original> (copy)"
 *   includeVariants?: boolean, — (R16) replicate the source's variants
 *                                 too (each variant + its scoped rows).
 *                                 Default false.
 *   includeDocuments?: boolean — (R17) copy documents by reference
 *                                 (share the storage object). Default true.
 * }
 *
 * Deep-clones a template: all jobs (with parent/child relationships),
 * all orders + order items, and anchor references rebased to the new
 * job IDs. Does NOT clone sourcedPlots — the copy starts with zero
 * usage, as a fresh starter.
 *
 * (R17) Documents copy BY REFERENCE by default — the new rows reuse the
 * source url/fileName with isPlaceholder=false, so a clone is immediately
 * usable without re-uploading. (The old placeholder model is gone.)
 * (R16) When includeVariants is set, each source variant is recreated on
 * the clone with its full scoped content via the shared copy helper.
 *
 * Keith Apr 2026 UX audit — "if you have a similar house type, cloning
 * is one click vs. rebuilding from scratch".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // (May 2026 pattern sweep) Cloning = creating a new template; gate
    // on EDIT_PROGRAMME like every other template mutation.
    if (
      !sessionHasPermission(
        session.user as { role?: string; permissions?: string[] },
        "EDIT_PROGRAMME",
      )
    ) {
      return NextResponse.json(
        { error: "You do not have permission to manage templates" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const newName = (body.name as string | undefined)?.trim();
    // (R16/R17) Clone options. Variants default OFF (copying N variants
    // worth of rows is opt-in); documents default ON (by reference).
    const includeVariants = body.includeVariants === true;
    const includeDocuments = body.includeDocuments !== false;

    // Base-scoped content (variantId IS NULL) is always copied.
    // (R16) Variant-scoped rows are loaded too when includeVariants is set,
    // grouped by variantId so each one seeds onto a recreated variant.
    const source = await prisma.plotTemplate.findUnique({
      where: { id },
      include: {
        jobs: {
          where: includeVariants ? undefined : { variantId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            orders: { include: { items: true } },
          },
        },
        materials: { where: includeVariants ? undefined : { variantId: null } },
        documents: { where: includeVariants ? undefined : { variantId: null } },
        inspections: { where: includeVariants ? undefined : { variantId: null } },
        variants: includeVariants
          ? { orderBy: { sortOrder: "asc" } }
          : false,
      },
    });
    if (!source) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    // (Jun 2026 audit) The whole clone runs in a single transaction —
    // pre-fix a mid-clone failure (timeout, FK issue, deploy restart)
    // left a half-built draft (e.g. jobs but no orders/inspections)
    // that looked complete in the list. Same envelope + rationale as
    // the sibling variant-seed route.
    const clone = await prisma.$transaction(
      async (tx) => {
        // Create the new template shell. Clones start as drafts so the user
        // has a chance to review (re-upload placeholder docs, tweak names,
        // adjust durations) before exposing the copy in the apply-picker.
        // (Jun 2026 audit) buildBudget/salePrice carry over — the go-live
        // gate requires both, so dropping them blocked every clone of a
        // priced template until the user re-keyed figures that already
        // existed on the source.
        const created = await tx.plotTemplate.create({
          data: {
            name: newName || `${source.name} (copy)`,
            description: source.description,
            typeLabel: source.typeLabel,
            buildBudget: source.buildBudget,
            salePrice: source.salePrice,
            isDraft: true,
          },
        });

        // (R17) documentMode — by reference (share the storage object,
        // isPlaceholder=false) when includeDocuments, else drop documents
        // entirely (don't even create placeholder rows).
        const documentMode = "reference" as const;

        // Base scope (variantId === null). The shared helper copies jobs
        // (parent/child), orders + items + lead times, materials, docs,
        // and inspections — the single source of truth shared with the
        // variant-seed flow so the two can't drift.
        // (Jun 2026 audit history: weatherAffected, lead-time fields, and
        // isBlocking are all carried by the helper.)
        await copyTemplateScope({
          tx,
          templateId: created.id,
          variantId: null,
          source: {
            jobs: source.jobs.filter((j) => j.variantId === null),
            materials: source.materials.filter((m) => m.variantId === null),
            documents: includeDocuments
              ? source.documents.filter((d) => d.variantId === null)
              : [],
            inspections: source.inspections.filter((i) => i.variantId === null),
          },
          documentMode,
        });

        // (R16) Variants — recreate each one + copy its variant-scoped
        // content. Skipped entirely when includeVariants is false (the
        // `variants` relation isn't even loaded in that case).
        if (includeVariants && source.variants) {
          for (const v of source.variants) {
            const newVariant = await tx.templateVariant.create({
              data: {
                templateId: created.id,
                name: v.name,
                description: v.description,
                sortOrder: v.sortOrder,
                buildBudget: v.buildBudget,
                salePrice: v.salePrice,
              },
            });
            await copyTemplateScope({
              tx,
              templateId: created.id,
              variantId: newVariant.id,
              source: {
                jobs: source.jobs.filter((j) => j.variantId === v.id),
                materials: source.materials.filter((m) => m.variantId === v.id),
                documents: includeDocuments
                  ? source.documents.filter((d) => d.variantId === v.id)
                  : [],
                inspections: source.inspections.filter(
                  (i) => i.variantId === v.id,
                ),
              },
              documentMode,
            });
          }
        }

        // Audit log: capture the clone-from event so the change log on the
        // new template starts with a clear origin point.
        await tx.templateAuditEvent.create({
          data: {
            templateId: created.id,
            userId: session.user?.id ?? null,
            userName: session.user?.name ?? session.user?.email ?? null,
            action: "cloned_from",
            detail: `Cloned from "${source.name}"${
              includeVariants && source.variants && source.variants.length > 0
                ? ` (incl. ${source.variants.length} variant${source.variants.length !== 1 ? "s" : ""})`
                : ""
            }${includeDocuments ? " · documents by reference" : " · no documents"}`,
          },
        });

        return created;
      },
      // Complex templates can have 20+ stages each with 5+ orders and
      // 10+ items — same envelope as the variant-seed route.
      { timeout: 60_000, maxWait: 10_000 },
    );

    return NextResponse.json({ id: clone.id, name: clone.name }, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to clone template");
  }
}
