import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Contact-scoped documents (RAMS, method statements, etc.) — stored as
 * SiteDocument rows with `contactId` set and `siteId` null. This scopes
 * them to the contractor across every site they work on, rather than
 * duplicating them per-site.
 *
 * Category defaults to "RAMS" on upload so they show up in the RAMS tab
 * on the contractor card.
 */

// GET /api/contacts/[id]/documents — list documents for this contact
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const docs = await prisma.siteDocument.findMany({
      where: { contactId: id },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(docs);
  } catch (err) {
    return apiError(err, "Failed to load contact documents");
  }
}

// POST /api/contacts/[id]/documents — upload a document against this contact
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // (May 2026 pattern sweep) Contact-scoped doc upload is the same
    // class of write as editing a contact — gate on MANAGE_ORDERS so
    // contractors can't dump RAMS rows against arbitrary contacts.
    if (
      !sessionHasPermission(
        session.user as { role?: string; permissions?: string[] },
        "MANAGE_ORDERS",
      )
    ) {
      return NextResponse.json(
        { error: "You do not have permission to manage contact documents" },
        { status: 403 },
      );
    }
    const { id } = await params;

    // Verify the contact exists before doing the upload work.
    const contact = await prisma.contact.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const name = (formData.get("name") as string) || file?.name;
    const category = (formData.get("category") as string | null) || "RAMS";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Keith Apr 2026 Q3=b — no file type or size restrictions; he'll police
    // uploads on his end. We still enforce the Supabase storage cap
    // (configurable in the bucket — default 50MB+) silently.

    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `documents/contacts/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await getSupabase()
      .storage.from(PHOTOS_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      console.error("Contact doc upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: { publicUrl } } = getSupabase()
      .storage.from(PHOTOS_BUCKET)
      .getPublicUrl(storagePath);

    const doc = await prisma.siteDocument.create({
      data: {
        name: name || file.name,
        url: publicUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || null,
        category,
        contactId: id,
        siteId: null,
        plotId: null,
        jobId: null,
        uploadedById: session.user.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `RAMS / method statement "${doc.name}" uploaded for ${contact.name}`,
        userId: session.user.id,
      },
    }).catch(() => { /* non-fatal */ });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to upload contact document");
  }
}
