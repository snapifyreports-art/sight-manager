import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const isValid = await compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;

        // Fetch user permissions
        const perms = await prisma.userPermission.findMany({
          where: { userId: user.id },
          select: { permission: true },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: perms.map((p) => p.permission),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.permissions = (user as { permissions: string[] }).permissions;
      }
      // Always refresh permissions from DB so changes take effect instantly
      if (token.id) {
        try {
          const freshPerms = await prisma.userPermission.findMany({
            where: { userId: token.id as string },
            select: { permission: true },
          });
          token.permissions = freshPerms.map((p) => p.permission);
          // Also refresh role in case it changed
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          if (freshUser) token.role = freshUser.role;
        } catch {
          // Non-critical — keep existing token permissions
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
        session.user.permissions = (token.permissions as string[]) || [];
      }
      return session;
    },
  },
});
