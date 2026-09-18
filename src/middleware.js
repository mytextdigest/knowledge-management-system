import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/auth/signin" },
  callbacks: {
    authorized({ req, token }) {
      const { pathname } = req.nextUrl;

      // Allow the auth pages to load without redirecting
      if (pathname.startsWith("/auth")) return true;

      // For all protected routes, require auth
      return !!token;
    },
  },
});

export const config = {
  matcher: [
    "/welcome-back/:path*",
    "/onboarding/:path*",
    // Deliberately NOT "/org/:path*" — /org/invite/[token] must stay
    // reachable while logged out (it's the invite-acceptance landing page).
    // (app)/org/[orgId]/layout.jsx already enforces its own session check.
    "/project/:path*",
    "/document/:path*",

    // Secure APIs
    "/api/documents/:path*",
    "/api/projects/:path*",
    "/api/settings/:path*",
    "/api/subscription/:path*",
    "/api/s3/:path*",
    "/api/cancel/:path*",
    "/api/test-session/:path*",
    "/api/stripe/checkout/:path*",
    "/api/stripe/portal/:path*",
    "/api/auth/change-password/:path*"
  ],
};

