import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendOtpEmail(email, otp) {
  await transporter.sendMail({
    from: `"KMS" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify your email",
    html: `
      <p>Your verification code is:</p>
      <h2>${otp}</h2>
      <p>This code expires in 10 minutes.</p>
    `,
  });
}

// FR-7 — one digest email per sync run (not one per file), to org super
// admins, linking to the Needs-Review queue. `to` accepts an array or a
// single address.
export async function sendSyncDigestEmail({ to, orgName, source, filesFound, needsReviewUrl }) {
  const recipients = Array.isArray(to) ? to.join(", ") : to;
  const plural = filesFound === 1 ? "" : "s";
  await transporter.sendMail({
    from: `"KMS" <${process.env.EMAIL_USER}>`,
    to: recipients,
    subject: `${filesFound} new document${plural} awaiting review — ${orgName}`,
    html: `
      <p>A ${source} sync just finished for <strong>${orgName}</strong>.</p>
      <p><strong>${filesFound}</strong> document${plural} ${filesFound === 1 ? "is" : "are"} now awaiting review.</p>
      <p><a href="${needsReviewUrl}">Review now</a></p>
    `,
  });
}
