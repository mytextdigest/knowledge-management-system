import CredentialsProviderModule from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

// next-auth's providers are CommonJS; the bundler unwraps `default`, plain
// Node (node --test) doesn't.
const interop = (m) => m.default ?? m;
const CredentialsProvider = interop(CredentialsProviderModule);

// The single NextAuth configuration: used by the route handler
// (src/app/api/auth/[...nextauth]/route.js) and by getServerSession callers.
//
// No database adapter: sessions are JWTs, and users are created by our own
// sign-up flow (and, for Microsoft sign-in, by the signIn callback), so
// NextAuth's Account/Session/VerificationToken tables are never needed.
export const authOptions = {
  session: {
    strategy: "jwt"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) throw new Error("No user found");
        if (!user.password) throw new Error("Invalid password");

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) throw new Error("Invalid password");

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return user;
      }
    }),
    // Used only for the "existing email tries to sign up again" flow —
    // verifies a one-time code instead of a password, then logs the user in.
    CredentialsProvider({
      id: "otp",
      name: "OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        otp: { label: "Code", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp) return null;

        const record = await prisma.otpToken.findFirst({
          where: {
            email: credentials.email,
            token: credentials.otp,
            expiresAt: { gt: new Date() }
          }
        });
        if (!record) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });
        if (!user) return null;

        await prisma.otpToken.deleteMany({ where: { email: credentials.email } });

        return user;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      const id = token?.id ?? token?.sub;
      if (id) session.user.id = id;
      return session;
    },
    async redirect({ url, baseUrl }) {
      // 1. Allow relative URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      // 2. Only allow production domain
      try {
        const host = new URL(url).host;
        if (host === process.env.NEXTAUTH_URL?.replace(/^https?:\/\//, "")) return url;
      } catch {}

      // Fallback
      return baseUrl;
    }
  },
  pages: {
    signIn: "/auth/signin",
    newUser: "/auth/signup",
  },
};


export function auth() {
  return getServerSession(authOptions);
}
