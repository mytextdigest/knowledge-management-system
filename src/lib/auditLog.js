import { prisma } from "@/lib/prisma";
import { redactAuditValue } from "@/lib/audit/redact.mjs";

// Backward compatible. Audit write failures must not block the original action.
export async function logAudit({
  orgId,
  actorUserId = null,
  targetUserId = null,
  action,
  entityType = null,
  entityId = null,
  before = null,
  after = null,
  metadata = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId,
        targetUserId,
        action,
        entityType,
        entityId,
        before: redactAuditValue(before),
        after: redactAuditValue(after),
        metadata: redactAuditValue(metadata),
      },
    });
  } catch (err) {
    // Avoid logging payloads: they may contain sensitive data.
    console.error("Failed to write audit log entry:", action, err?.message ?? "unknown error");
  }
}
