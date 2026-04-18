import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

const nextAuthResult = NextAuth({
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
      // Always refresh permissions + verify the user still exists. If the
      // user row was deleted (e.g. data reset, manual removal) the JWT is
      // stale — we mark it invalid so session() returns no user, forcing
      // a clean re-login. Without this, every downstream mutation that
      // records `userId: session.user.id` on EventLog/JobAction/etc. fails
      // with a foreign-key constraint violation.
      if (token.id) {
        try {
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { id: true, role: true },
          });
          if (!freshUser) {
            token.invalidated = true;
            return token;
          }
          token.role = freshUser.role;
          const freshPerms = await prisma.userPermission.findMany({
            where: { userId: token.id as string },
            select: { permission: true },
          });
          token.permissions = freshPerms.map((p) => p.permission);
        } catch {
          // DB error is non-critical — keep existing token data so a brief
          // DB outage doesn't log everyone out.
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Flag stale tokens so our auth() wrapper below returns null.
      if (token.invalidated) {
        (session as { _invalidated?: boolean })._invalidated = true;
        return session;
      }
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
        session.user.permissions = (token.permissions as string[]) || [];
      }
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuthResult;

// Wrapped auth() — returns null for stale sessions (user deleted from DB).
// Routes do `if (!session)` as their first gate; without this wrap, a stale
// token would slip through and cause FK violations on audit-log writes.
export const auth = (async () => {
  const session = await nextAuthResult.auth();
  if (!session) return null;
  if ((session as { _invalidated?: boolean })._invalidated) return null;
  if (!session.user?.id) return null;
  return session;
}) as typeof nextAuthResult.auth;
