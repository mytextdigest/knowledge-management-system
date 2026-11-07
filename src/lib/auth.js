import CredentialsProviderModule from "next-auth/providers/credentials";
import AzureADProviderModule from "next-auth/providers/azure-ad";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveEntraSignIn, SsoError } from "@/lib/sso/entra";
import { isPasswordLoginAllowed } from "@/lib/sso/discovery";
import { ensureFreshPrincipals } from "@/lib/identity/entraIdentity";

// next-auth's providers are CommonJS; the bundler unwraps `default`, plain
// Node (node --test) doesn't.
const interop = (m) => m.default ?? m;
const CredentialsProvider = interop(CredentialsProviderModule);
const AzureADProvider = interop(AzureADProviderModule);

// Microsoft sign-in (EKP A1) through the multi-tenant "KMS Sign-in" Entra app.
// "organizations" accepts work accounts from any tenant; resolveEntraSignIn
// then admits only tenants an org has connected (OrgSsoConfig).
const microsoftProviders = process.env.ENTRA_SSO_CLIENT_ID
  ? [
      AzureADProvider({
        clientId: process.env.ENTRA_SSO_CLIENT_ID,
        clientSecret: process.env.ENTRA_SSO_CLIENT_SECRET,
        tenantId: "organizations",
        // select_account: Microsoft always asks which account, instead of
        // silently reusing whoever last signed in on this browser.
        authorization: { params: { scope: "openid profile email User.Read", prompt: "select_account" } },
        // The default profile() downloads the user's photo into the JWT
        // cookie; we only need the identity.
        profile(profile) {
          return { id: profile.oid ?? profile.sub, name: profile.name, email: profile.email, image: null };
        },
      }),
    ]
  : [];

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

        // The org has made Microsoft the only way in for this email's domain.
        if (!(await isPasswordLoginAllowed(user))) throw new Error("USE_MICROSOFT");

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
        if (!(await isPasswordLoginAllowed(user))) throw new Error("USE_MICROSOFT");

        await prisma.otpToken.deleteMany({ where: { email: credentials.email } });

        return user;
      }
    }),
    ...microsoftProviders
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "azure-ad") return true;
      try {
        const { user: kmsUser } = await resolveEntraSignIn(profile);
        // NextAuth builds the token from this object after signIn returns:
        // swap the Microsoft id for the KMS user.
        user.id = kmsUser.id;
        user.email = kmsUser.email;
        user.name = kmsUser.name ?? user.name;
        return true;
      } catch (err) {
        if (err instanceof SsoError) return `/auth/signin?error=${err.code}`;
        console.error("Microsoft sign-in failed:", err);
        return "/auth/signin?error=SsoFailed";
      }
    },
    async jwt({ token, user, account, profile }) {
      if (user) token.id = user.id;
      if (account?.provider === "azure-ad") token.entraOid = profile?.oid;
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
  events: {
    // A-21/A-10: link the user to their Entra account (by verified email, if
    // they didn't use Microsoft) and read their groups, so SharePoint files
    // shared with them show up from the first page. Never blocks sign-in.
    async signIn({ user }) {
      await ensureFreshPrincipals(prisma, user?.id, { force: true });
    },
  },
  pages: {
    signIn: "/auth/signin",
    newUser: "/auth/signup",
  },
};


export function auth() {
  return getServerSession(authOptions);
}
