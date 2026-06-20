import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { sendOtpEmail } from "@/lib/mailer";

const prisma = new PrismaClient();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req) {
  const { email, password } = await req.json();

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Existing email re-attempting signup: don't error, don't touch their
    // password — just send an OTP so the client can verify-and-log-in
    // (see /api/auth/verify-otp's "existing" mode) and land on Welcome Back.
    const otp = generateOtp();

    await prisma.otpToken.create({
      data: {
        email,
        token: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
      },
    });

    await sendOtpEmail(email, otp);

    return Response.json({ existingAccount: true, email }, { status: 200 });
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      password: hashed,
      emailVerified: false,
    },
  });

  const otp = generateOtp();

  await prisma.otpToken.create({
    data: {
      email,
      token: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
    },
  });

  await sendOtpEmail(email, otp);

  return Response.json({ existingAccount: false, email }, { status: 201 });
}
