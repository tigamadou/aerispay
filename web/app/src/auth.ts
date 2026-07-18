import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { logActivity, ACTIONS } from "@/lib/activity-log";
import type { Role } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 h
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
          return null;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (!user || !user.actif) {
          await logActivity({
            action: ACTIONS.AUTH_LOGIN_FAILED,
            metadata: { reason: !user ? "unknown_email" : "inactive_account", email: normalizedEmail },
          });
          return null;
        }

        const valid = await compare(password, user.motDePasse);
        if (!valid) {
          await logActivity({
            action: ACTIONS.AUTH_LOGIN_FAILED,
            actorId: user.id,
            metadata: { reason: "invalid_password" },
          });
          return null;
        }

        await logActivity({
          action: ACTIONS.AUTH_LOGIN_SUCCESS,
          actorId: user.id,
          entityType: "User",
          entityId: user.id,
          metadata: { email: user.email, nom: user.nom, role: user.role },
        });

        return {
          id: user.id,
          name: user.nom,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      await logActivity({
        action: ACTIONS.AUTH_LOGOUT,
        actorId: (token?.id as string) ?? null,
      });
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as Role;
        token.email = user.email ?? undefined;
        token.name = user.name ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.email = (token.email as string) ?? session.user.email ?? "";
        session.user.name = (token.name as string) ?? session.user.name ?? null;
      }
      return session;
    },
  },
});
