import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET — return user's permissions and site assignments
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.permissions, "MANAGE_USERS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [perms, siteAccess] = await Promise.all([
    prisma.userPermission.findMany({
      where: { userId: id },
      select: { permission: true },
    }),
    prisma.userSite.findMany({
      where: { userId: id },
      select: { siteId: true },
    }),
  ]);

  return NextResponse.json({
    permissions: perms.map((p) => p.permission),
    siteIds: siteAccess.map((s) => s.siteId),
  });
}

// PUT — replace user's permissions and site assignments
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.permissions, "MANAGE_USERS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { permissions, siteIds } = body as {
    permissions: string[];
    siteIds?: string[];
  };

  if (!Array.isArray(permissions)) {
    return NextResponse.json(
      { error: "permissions array is required" },
      { status: 400 }
    );
  }

  // Validate all permission keys
  const valid = permissions.every((p) =>
    (ALL_PERMISSIONS as readonly string[]).includes(p)
  );
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid permission key(s)" },
      { status: 400 }
    );
  }

  // Build transaction operations
  const ops = [
    prisma.userPermission.deleteMany({ where: { userId: id } }),
    prisma.userPermission.createMany({
      data: permissions.map((p) => ({ userId: id, permission: p })),
    }),
  ];

  // If siteIds provided, also update site assignments
  if (Array.isArray(siteIds)) {
    ops.push(
      prisma.userSite.deleteMany({ where: { userId: id } }),
      prisma.userSite.createMany({
        data: siteIds.map((siteId) => ({ userId: id, siteId })),
      })
    );
  }

  await prisma.$transaction(ops);

  const user = await prisma.user.findUnique({
    where: { id },
    select: { name: true },
  });
  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `Permissions updated for ${user?.name || "user"} (${permissions.length} permission${permissions.length !== 1 ? "s" : ""}${Array.isArray(siteIds) ? `, ${siteIds.length} site${siteIds.length !== 1 ? "s" : ""}` : ""})`,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ success: true });
}
