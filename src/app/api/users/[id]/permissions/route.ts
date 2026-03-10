import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";

// GET — return user's permissions as string array
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

  const perms = await prisma.userPermission.findMany({
    where: { userId: id },
    select: { permission: true },
  });

  return NextResponse.json(perms.map((p) => p.permission));
}

// PUT — replace user's permissions
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
  const { permissions } = body as { permissions: string[] };

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

  // Delete all existing, create new
  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId: id } }),
    prisma.userPermission.createMany({
      data: permissions.map((p) => ({ userId: id, permission: p })),
    }),
  ]);

  return NextResponse.json({ success: true });
}
