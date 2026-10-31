import { prisma } from '../prisma.mjs';
import { transporter } from '../mailer.js';
import { validateNotificationInput } from './types.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

// Always call after the owning transaction commits. Delivery is best-effort.
export async function notify({ orgId, userIds, type, title, body = null, link = null }) {
  const issue = validateNotificationInput({ orgId, userIds, type, title, body, link });
  if (issue) { console.warn('Notification rejected:', issue); return { created: 0, emailed: 0 }; }
  const ids = [...new Set(userIds)];
  if (!ids.length) return { created: 0, emailed: 0 };
  try {
    const members = await prisma.organizationMember.findMany({
      where: { orgId, userId: { in: ids } }, select: { userId: true },
    });
    const recipients = members.map(m => m.userId);
    if (!recipients.length) return { created: 0, emailed: 0 };
    const [prefs, users] = await Promise.all([
      prisma.notificationPreference.findMany({ where: { userId: { in: recipients }, type }, select: { userId: true, inApp: true, email: true } }),
      prisma.user.findMany({ where: { id: { in: recipients } }, select: { id: true, email: true } }),
    ]);
    const prefMap = new Map(prefs.map(p => [p.userId, p]));
    const data = recipients.filter(id => prefMap.get(id)?.inApp !== false).map(userId => ({ orgId, userId, type, title, body, link }));
    let created = 0;
    try {
      if (data.length) created = (await prisma.notification.createMany({ data })).count;
    } catch (err) { console.error('In-app notification persistence failed:', err?.message); }

    // SMTP is opt-in at deployment level: avoid accidental delivery from dev.
    if (process.env.KMS_NOTIFICATION_EMAIL_ENABLED !== 'true' || !process.env.EMAIL_USER || !process.env.EMAIL_PASS)
      return { created, emailed: 0 };
    const base = process.env.NEXTAUTH_URL;
    const safeBase = base && /^https:\/\/[^/]+\/?$/.test(base) ? base.replace(/\/$/, '') : null;
    const href = safeBase && link ? safeBase + link : null;
    let emailed = 0;
    for (const user of users) {
      if (!user.email || prefMap.get(user.id)?.email === false) continue;
      try {
        await transporter.sendMail({
          from: `"KMS" <${process.env.EMAIL_USER}>`, to: user.email,
          subject: title,
          text: [title, body, href].filter(Boolean).join('\n\n'),
          html: `<p>${escapeHtml(title)}</p>${body ? `<p>${escapeHtml(body)}</p>` : ''}${href ? `<p><a href="${escapeHtml(href)}">Open in KMS</a></p>` : ''}`,
        });
        emailed++;
      } catch (err) { console.error('Notification email failed:', err?.message); }
    }
    return { created, emailed };
  } catch (error) {
    console.error('Notification delivery failed:', error?.message);
    return { created: 0, emailed: 0 };
  }
}
