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

// Shared wrapper so every transactional email shares the same look
// (branded header, card, footer) instead of unstyled <p>/<h2> tags.
function wrapEmail(bodyHtml) {
  return `
    <div style="background:#f3f4f6;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:#2563eb;padding:20px 24px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">KMS</span>
        </div>
        <div style="padding:28px 24px;color:#111827;font-size:15px;line-height:1.6;">
          ${bodyHtml}
        </div>
        <div style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
          Sent by KMS. If this wasn't you, you can safely ignore this email.
        </div>
      </div>
    </div>
  `;
}

export async function sendOtpEmail(email, otp) {
  await transporter.sendMail({
    from: `"KMS" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify your email",
    html: wrapEmail(`
      <p style="margin:0 0 16px;">Your verification code is:</p>
      <div style="text-align:center;margin:0 0 16px;">
        <span style="display:inline-block;padding:12px 28px;background:#f3f4f6;border-radius:8px;font-size:28px;font-weight:700;letter-spacing:6px;color:#111827;">${otp}</span>
      </div>
      <p style="margin:0;color:#6b7280;font-size:13px;">This code expires in 10 minutes.</p>
    `),
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
    html: wrapEmail(`
      <p style="margin:0 0 12px;">A ${source} sync just finished for <strong>${orgName}</strong>.</p>
      <p style="margin:0 0 20px;"><strong>${filesFound}</strong> document${plural} ${filesFound === 1 ? "is" : "are"} now awaiting review.</p>
      <p style="margin:0;"><a href="${needsReviewUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:500;">Review now</a></p>
    `),
  });
}
