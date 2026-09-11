import { prisma } from "@/lib/prisma";

// Records a security/administrative event (role grants, department
// delete/rename, etc). Never throws — a failed audit write shouldn't
// block the action it's describing.
export async function logAudit({ orgId, actorUserId = null, targetUserId = null, action, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: { orgId, actorUserId, targetUserId, action, metadata },
    });
  } catch (err) {
    console.error("Failed to write audit log entry:", action, err);
  }
}
