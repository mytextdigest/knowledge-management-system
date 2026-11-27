import { NextResponse } from "next/server";
import { findSsoConfigForEmail, microsoftSignInTarget } from "@/lib/sso/discovery";

// EKP A-5: email-first sign-in. Tells the sign-in and sign-up pages whether
// an email must go to Microsoft. Reveals only whether the email's domain uses
// Microsoft sign-in, never whether an account exists.
export async function POST(req) {
  const { email } = await req.json().catch(() => ({}));
  const config = await findSsoConfigForEmail(email);
  if (!config) return NextResponse.json({ microsoft: false });
  // E-12: SAML or OIDC, as the org has chosen.
  return NextResponse.json({ microsoft: true, ...microsoftSignInTarget(config) });
}
