import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { hasPermission, DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET — list all users
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.permissions, "MANAGE_USERS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      company: true,
      phone: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

// POST — create a new user
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.permissions, "MANAGE_USERS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, jobTitle, company, phone } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json(
      { error: "name, email, password, and role are required" },
      { status: 400 }
    );
  }

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with that email already exists" },
      { status: 409 }
    );
  }

  const hashedPassword = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
      jobTitle: jobTitle || null,
      company: company || null,
      phone: phone || null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      company: true,
      phone: true,
      createdAt: true,
    },
  });

  // Populate default permissions for this role
  const defaults = DEFAULT_PERMISSIONS[role as UserRole] || [];
  if (defaults.length > 0) {
    await prisma.userPermission.createMany({
      data: defaults.map((p) => ({ userId: user.id, permission: p })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json(user, { status: 201 });
}
