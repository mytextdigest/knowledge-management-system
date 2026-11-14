// Shared sandbox for the Expert Discovery DB-integration tests (Test 3, 6, 9,
// 10, 11 from EXPERT_DISCOVERY_TEST_TRACKER.md). Every helper here creates
// throwaway rows directly via Prisma - no signup flow, no auth session, no
// real login ever happens. `cleanup()` deletes everything it created, in an
// order that respects the schema's real FK/cascade rules (Document's link to
// Organization is onDelete: SetNull, not Cascade, so Documents/Conversations
// must be deleted explicitly before the Organization and Users).

export function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeSandbox(prisma, label) {
  const tag = `${label}-${suffix()}`;
  const state = {
    orgId: null,
    userIds: [],
    documentIds: [],
    conversationIds: [],
  };

  return {
    tag,
    state,

    async createOrg() {
      const org = await prisma.organization.create({ data: { name: `tier2-${tag}` } });
      state.orgId = org.id;
      return org;
    },

    async createUser(name) {
      const user = await prisma.user.create({
        data: { email: `${name}-${tag}@example.test`, name },
      });
      state.userIds.push(user.id);
      await prisma.organizationMember.create({
        data: { orgId: state.orgId, userId: user.id, role: "employee" },
      });
      return user;
    },

    async createDepartment(name) {
      return prisma.department.create({ data: { orgId: state.orgId, name: `${name}-${tag}` } });
    },

    async addDeptMember(departmentId, userId) {
      return prisma.departmentMember.create({ data: { departmentId, userId, role: "member" } });
    },

    async createTopic(name, scope = "repository") {
      return prisma.topic.create({
        data: { orgId: state.orgId, scope, name: `${name}-${tag}` },
      });
    },

    // `createdAt` lets a test backdate the upload itself (needed for the
    // "old expert" / stale-decay scenarios).
    async createDocument({ userId, departmentId = null, createdAt = new Date() }) {
      const doc = await prisma.document.create({
        data: {
          filename: `doc-${suffix()}.txt`,
          content: "synthetic test content",
          userId,
          orgId: state.orgId,
          departmentId,
          scope: "repository",
          lifecycle: "published",
          createdAt,
        },
      });
      state.documentIds.push(doc.id);
      return doc;
    },

    async linkTopicDocument(topicId, documentId, assignedAt = new Date()) {
      return prisma.topicDocument.create({
        data: { topicId, documentId, confidence: 1, assignedAt },
      });
    },

    async addInteraction({ documentId, userId, type = "view", durationSeconds = null, createdAt = new Date() }) {
      return prisma.documentInteraction.create({
        data: { documentId, userId, orgId: state.orgId, type, durationSeconds, createdAt },
      });
    },

    async addCitation({ userId, citedDocIds, createdAt = new Date() }) {
      return prisma.chatAuditLog.create({
        data: { orgId: state.orgId, userId, question: "synthetic question", citedDocIds, createdAt },
      });
    },

    // A "real question" per the scoring policy's length filter (> 10 chars).
    async addDocumentQuestion({ documentId, userId, content = "Can you explain how this section actually works?", createdAt = new Date() }) {
      const conversation = await prisma.conversation.create({
        data: { userId, documentId, createdAt },
      });
      state.conversationIds.push(conversation.id);
      return prisma.message.create({
        data: { conversationId: conversation.id, role: "user", content, createdAt },
      });
    },

    async addLesson({ documentId, authorUserId, status = "published", createdAt = new Date() }) {
      return prisma.lesson.create({
        data: {
          orgId: state.orgId,
          documentId,
          authorUserId,
          status,
          whatHappened: "Synthetic lesson body for testing.",
          createdAt,
        },
      });
    },

    async cleanup() {
      if (state.conversationIds.length) {
        await prisma.message.deleteMany({ where: { conversationId: { in: state.conversationIds } } });
        await prisma.conversation.deleteMany({ where: { id: { in: state.conversationIds } } });
      }
      if (state.documentIds.length) {
        await prisma.document.deleteMany({ where: { id: { in: state.documentIds } } });
      }
      if (state.orgId) {
        await prisma.organization.delete({ where: { id: state.orgId } }).catch(() => {});
      }
      if (state.userIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: state.userIds } } });
      }
    },
  };
}
