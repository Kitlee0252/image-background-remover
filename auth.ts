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
    session: { strategy: "jwt" as const },
    callbacks: {
      jwt({ token, user }) {
        // On initial sign-in, persist the user ID into the JWT
        if (user?.id) {
          token.userId = user.id;
        }
        return token;
      },
      session({ session, token }) {
        // Expose userId on the session object for client-side access
        if (token.userId && session.user) {
          session.user.id = token.userId as string;
        }
        return session;
      },
    },
  };
});
