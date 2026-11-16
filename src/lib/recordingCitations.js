// EKP E11.5 (Workstream E, E-9): a linked transcript is cited as its
// recording (WS_E_CONTENT_COVERAGE.md §3.2), when the user can open the
// recording; otherwise the transcript itself is cited.
import { prisma } from "@/lib/prisma";
import { canViewDocument } from "@/lib/access/documentAccess";

/** transcript ids → Map(transcriptId → { documentId, filename }) of the recordings the user can open. */
export async function linkedRecordings(transcriptIds, { userId, role, db = prisma }) {
  const ids = [...new Set(transcriptIds)].filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  const rows = await db.document.findMany({
    where: { id: { in: ids }, transcriptOfId: { not: null } },
    select: {
      id: true,
      transcriptOf: {
        select: {
          id: true, filename: true, userId: true, orgId: true, departmentId: true, lifecycle: true,
          deletedAt: true, aclSyncedAt: true, project: { select: { departmentId: true } },
        },
      },
    },
  });
  for (const { id, transcriptOf: rec } of rows) {
    if (!rec || rec.deletedAt) continue;
    if (rec.userId === userId || (await canViewDocument(rec, { userId, role, db }))) {
      map.set(id, { documentId: rec.id, filename: rec.filename });
    }
  }
  return map;
}
