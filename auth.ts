import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { getD1 } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = drizzle(getD1());

  return {
    adapter: DrizzleAdapter(db),
    providers: [Google],
    trustHost: true,
    session: { strategy: "jwt" as const },
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id;
        }
        return token;
      },
      session({ session, token }) {
        if (token.userId && session.user) {
          session.user.id = token.userId as string;
        }
        return session;
      },
    },
  };
});
