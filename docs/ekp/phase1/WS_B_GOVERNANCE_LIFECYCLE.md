# Workstream B: Governance & Lifecycle (Phase 1)

| | |
|---|---|
| **Owners** | Sandeep (lane 1) & Simran (lane 2), see §1.1 and §6 |
| **Reviewer** | Johurul (plus the other B owner) |
| **Requirements** | E19, E21, E22, E23, E24, E25, E26, E31 |
| **Foundations owned** | F2 audit service, F4 notifications, F5 org settings, F6 workflow engine |
| **Phase 1 window** | 13 Oct – 22 Nov 2026 (6 weeks, Mon–Sat) |
| **Status** | Shared design + B0 ready for review. B1–B4 outlined; detail each section before it starts. |
| **Version** | **v2, 2026-10-22.** Adds NYPA's RFP Q&A answers (see "What changed in v2" below). Based on the copy of `WS_B_GOVERNANCE_LIFECYCLE.md` on `dev` at `2371067`. This is the canonical v2 workstream document; implementation remains subject to review and integration testing. |

**Source documents (don't copy from them, link to them):**
- Requirements and acceptance criteria: [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (§4.7, §4.8, E31; NYPA's answers in §6.2–6.3)
- NYPA's answers to vendor questions: `docs/ekp/Attachment 5 - Q+A format NYPA Response.xlsx` (cited as "Q&A #n")
- Architecture and foundations: [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§4 F2, F4, F5, F6; §5.2)
- Plan, workflow and status board: [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md)

### What changed in v2

NYPA answered other vendors' RFP questions, and some answers affect Workstream B. **No completed task is invalidated.** Two follow-up tasks are added (`B-23`, `B-24`).

| NYPA said | Change in this document | Task |
|---|---|---|
| Human review of all AI-generated content is required, "but it shouldn't need to be overly burdensome. Greater scrutiny should be required of more highly technical and critical knowledge content" (Q&A #195). | New rule in §2. `summary.requireApproval` becomes per-department/category rules (§3.2). One-click and bulk approve (B2). | `B-23` |
| There's no retention schedule for knowledge ("life of org"), and no legal hold or records-request handling is needed (Q&A #181, #187). | `retention.deletedDays` can be `null` = never purge (§3.2, B1). No retention or legal-hold features. | `B-24` |
| The KM team (about 5 people) is the product owner and decides what is retained, archived, restricted or retired (Q&A #164, #166). Users: about 2,600 in total, about 200 KM power users, 100 concurrent at peak (Q&A #48, #69, #191). | Note in §2: approvers and decommission decisions sit with KM admins. Size metrics queries and inboxes for these numbers. | — |
| The solution "should be able to facilitate content reviews for staleness". Duplicate content "is not believed to be an issue" (Q&A #194). | B3 is confirmed as scoped. No new duplicate (E27) work. | — |
| Sync should be near real-time, under 5 minutes (Q&A #99), although scheduled indexing is also acceptable (Q&A #46). | Workstream A lowers the scheduler's minimum interval from 15 to 5 minutes. B's daily jobs are unaffected. | (A) |
| Content remediation and cleanup are done by NYPA, not the vendor (Q&A #104, #105). | The governance tools must make reviews easy for NYPA's KM team; we don't do the cleanup. | — |

**How this document is used:** the shared design (§3) and B0 are reviewed before coding starts. Each later package section is completed and reviewed just before that package starts. Progress is tracked in the task tracker (§6) at the bottom of this file.

## 1. Scope

| Package | Covers (PRS FR numbers) | Foundations | Weeks |
|---|---|---|---|
| **B0** Governance foundations | NFR-2, NFR-3 | F2, F5, F4 | 1–3 |
| **B1** Document records: decommission, versions, ownership | E23.1–E23.5, E24.1–E24.5 | F2 | 2 |
| **B2** Publishing: summary review, completeness, workflow engine | E19.2–E19.4, E21.1–E21.4, E22.1–E22.7, E23.6 | F6 | 3–4 |
| **B3** Review cycles and stale content | E25.1–E25.5, E26.1–E26.4 | F3 (from A), F6 | 5 |
| **B4** Governance metrics | E31.1–E31.4 | — | 6 |

**Out of scope for Phase 1:**
- Taxonomy terms as workflow/policy scope (Workstream C). Phase 1 scopes by department and category.
- The full content health dashboard E28 (Workstream D). B exposes the query helpers it needs (owner coverage, completeness).
- Template-based authoring E14 (Workstream E). It reuses F6 later.

### 1.1 Split between Sandeep and Simran

Two lanes, so the two of you rarely edit the same files in the same week:

| Week | Lane 1 (Sandeep): engine and workflows | Lane 2 (Simran): records, metadata and reporting |
|---|---|---|
| 1 | F2 audit service (everyone depends on it) | F5 org settings |
| 2 | E23 decommission, supersede, versions | E24 ownership and stewardship |
| 3 | F6 workflow engine (models + engine + tests) | F4 notifications, E19 summary review, E21 completeness |
| 4 | E22 publishing workflow (engine wiring + admin UI) | "My tasks" inbox + document workflow history UI |
| 5 | E25 review policies (`reviews.due-scan`) | E26 stale scan job + badges |
| 6 | Hardening, end-to-end tests | E31 governance metrics |

## 2. Rules That Apply to Every B Package

- **Reviewer, not author.**
  - Publishing or approving always needs a reviewer role (dept_admin of that department, super_admin, or a configured approver).
  - **The submitter can never approve their own submission.** This is enforced in the engine, not the UI.
- **Every state change is audit-logged** through F2 (NFR-2).
- **Nothing configurable lives in code.** Thresholds, required fields, intervals and rules go through F5 (NFR-3).
- **Guests are read-only.** Members can submit but not approve. Check with `resolveOrgRole` / `canManageDepartment`, as existing routes do.
- **Existing behaviour is the fallback.** If an org configures nothing, KMS behaves exactly as today (department admin publishes directly).
- **Human review that isn't burdensome** (v2, Q&A #195).
  - AI-generated content always shows that it's AI-generated and pending review.
  - Whether approval *blocks* publishing is configurable per department or category: strict for technical or critical content, light elsewhere.
  - Approving should take one click, and reviewers can approve in bulk.
- **The KM team decides** (v2, Q&A #164, #166). At NYPA, KM admins (super_admin / dept_admin) approve publishing and decide on retain, archive, restrict and retire. Design defaults so this small team (about 5 people) isn't the bottleneck for about 200 contributors.

## 3. Shared Design (decided once for the whole workstream)

### 3.1 F2: Audit service

**Today:**
- `src/lib/auditLog.js` `logAudit({ orgId, actorUserId, targetUserId, action, metadata })`, which never throws.
- `AuditLog` has no entity columns.
- It has only 3 call sites.

**Change** (backward-compatible, so existing calls keep working):

```prisma
model AuditLog {
  // existing fields …
  entityType String?  @map("entity_type")  // "document" | "workflow" | "setting" | "user" | …
  entityId   String?  @map("entity_id")
  before     Json?
  after      Json?

  @@index([entityType, entityId])
}
```

```js
logAudit({ orgId, actorUserId, targetUserId, action, entityType, entityId, before, after, metadata })
```

**Event vocabulary** (constants in `src/lib/audit/events.js`; no free-text actions):

| Area | Actions |
|---|---|
| Document | `document.published`, `document.archived`, `document.retired`, `document.restored`, `document.deleted`, `document.purged`, `document.superseded`, `document.version_created`, `document.version_restored`, `document.owner_changed`, `document.steward_changed`, `document.summary_approved`, `document.summary_edited` |
| Workflow | `workflow.submitted`, `workflow.approved`, `workflow.rejected`, `workflow.changes_requested`, `workflow.escalated`, `workflow.cancelled` |
| Review | `review.started`, `review.completed`, `review.escalated` |
| Config | `config.changed`, `workflow.definition_changed`, `review.policy_changed` |
| Auth (used by A) | `auth.sso_login`, `auth.sso_user_created` |

**UI:**
- A "History" tab on the document page, querying by `entityType = document` and `entityId`.
- Event-type and date filters added to the existing org audit-log view (`api/org/[orgId]/audit-log`).

### 3.2 F5: Org settings

```prisma
model OrgSetting {
  id        String   @id @default(cuid())
  orgId     String
  key       String
  value     Json
  updatedBy String?
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([orgId, key])
}
```

- `src/lib/settings/registry.js` defines each key's default, validation and admin label.
- `getSetting(orgId, key)` returns the stored value or the default, cached for 60 s.
- `setSetting(...)` validates the value, saves it and writes `config.changed` with before/after.
- The existing per-user `Setting` model is unrelated and stays as it is.

| Key | Default | Used by |
|---|---|---|
| `summary.requireApproval` | `false`. **v2:** also accepts rules `[{ departmentIds?, categories?, required: true }]`, using the same matching as `metadata.requiredFields`. `true`/`false` still mean the whole org. | E19, E21 |
| `metadata.requiredFields` | `[]` (rules `{ field, departmentIds?, categories? }`) | E21 |
| `ownership.default` | `"uploader"` (or `"department_owner"`) | E24 |
| `retention.deletedDays` | `30`. **v2:** `null` = never purge (soft-deleted items stay restorable). NYPA has no retention schedule (Q&A #181). | E23 |
| `stale.rules` | `{ noUpdateDays: 365, noViewDays: 180 }` (replaces the script's constant) | E26 |
| `classification.categoryThreshold`, `classification.departmentThreshold`, `duplicates.threshold` | current env values | E20 (moves existing env vars into settings) |
| `sharepoint.storeOriginals`, sync interval | `false`, `60` (v2: minimum 5 minutes, NFR-6) | Workstream A |

**Admin UI:** Settings → Governance (super_admin; dept_admin read-only), grouped by area.

### 3.3 F4: Notifications

```prisma
model Notification {
  id        String    @id @default(cuid())
  orgId     String
  userId    String
  type      String    // "workflow.task_assigned" | "workflow.decided" | "review.due" | "review.overdue" | "content.stale" | "ownership.assigned" | "summary.pending_review"
  title     String
  body      String?
  link      String?
  readAt    DateTime? @map("read_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([userId, readAt])
}

model NotificationPreference {
  id      String  @id @default(cuid())
  userId  String
  type    String
  inApp   Boolean @default(true)
  email   Boolean @default(true)

  @@unique([userId, type])
}
```

- `notify({ orgId, userIds, type, title, body, link })` writes in-app rows and sends email through the existing `src/lib/mailer.js` according to preference. Never throws.
- **UI:** a bell icon with an unread count in the header, a notifications page, and a preferences page.
- **Phase 1 sends immediately.** A daily digest is a later enhancement.

### 3.4 F6: Workflow engine

One engine serves publishing (E22), periodic review (E25), decommission approval (E23.6), and later templates (E14).

```prisma
model WorkflowDefinition {
  id            String   @id @default(cuid())
  orgId         String
  name          String
  kind          String   // "publish" | "review" | "decommission"
  departmentIds String[] @default([])   // empty = whole org
  categories    String[] @default([])   // empty = all
  version       Int      @default(1)
  active        Boolean  @default(true)
  stages        WorkflowStage[]
}

model WorkflowStage {
  id           String  @id @default(cuid())
  definitionId String
  order        Int
  name         String
  approverType String  // "role" | "owner" | "steward" | "users"
  approverRef  Json?   // role name, or [userId]
  rule         String  @default("any") // "any" | "all"
  slaDays      Int?
}

model WorkflowInstance {
  id           String   @id @default(cuid())
  definitionId String
  definitionVersion Int
  documentId   String
  status       String   // "in_progress" | "approved" | "rejected" | "cancelled"
  currentStage Int
  startedById  String
  startedAt    DateTime @default(now())
  finishedAt   DateTime?
  tasks        WorkflowTask[]

  @@index([documentId])
}

model WorkflowTask {
  id         String    @id @default(cuid())
  instanceId String
  stageId    String
  assigneeId String
  status     String    // "open" | "approved" | "rejected" | "changes_requested" | "superseded"
  comment    String?
  dueAt      DateTime?
  actedAt    DateTime?

  @@index([assigneeId, status])
}
```

**Engine** (`src/lib/workflow/engine.js`), where every function is one Prisma transaction plus F2 and F4 calls after commit:

| Function | Behaviour |
|---|---|
| `findDefinition({ orgId, kind, document })` | The most specific active match (department + category, then department, then org). `null` means use the legacy behaviour. |
| `start({ definition, documentId, actorId })` | Creates the instance and the first stage's tasks. **Removes the submitter from assignees.** If that leaves a stage with no assignee, it falls back to the department admin. If there's still nobody, it fails with a clear error. |
| `act({ taskId, actorId, decision, comment })` | Checks that the actor is the assignee and not the submitter. `any`: the first approval completes the stage. `all`: waits for every task. Reject or changes_requested ends the instance. A comment is required for reject and changes_requested. |
| `advance(instance)` | Next stage, or completion. On completion it calls the kind's handler (publish → lifecycle `published`; review → record the outcome; decommission → archive/retire/delete). |
| `escalate()` | Called by a scheduled job. Overdue tasks (`dueAt` passed) notify the stage's escalation target (department admin). |

**Pinned version:** an instance stores `definitionVersion`. Editing a definition creates a new version, and running instances finish on the version they started with.

### 3.5 Lifecycle states

| State | Visible in search/answers | New? |
|---|---|---|
| `draft` | no | existing |
| `in_review` | no (visible to submitter, assignees and admins) | **new (E22)** |
| `published` | yes | existing |
| `archived` | no by default, can be filtered in | existing |
| `retired` | no | existing |
| + `supersededById` set | no by default; the old page links to the new one | **new (E23)** |
| + `deletedAt` set | never (purged after the retention period) | **new (E23)** |

**Visibility is enforced in Workstream A's central access predicate (F1), not in each route.** Give A the final field names at the review, and A wires them in.

`ALLOWED_TRANSITIONS` in `src/app/api/documents/[id]/lifecycle/route.js` stays the single transition table. It gains `draft → in_review` (any contributor) and `in_review → draft / published` (engine only).

### 3.6 Data model changes owned by B

| Model / field | Package |
|---|---|
| `AuditLog.entityType`, `entityId`, `before`, `after` | B0 |
| `OrgSetting` | B0 |
| `Notification`, `NotificationPreference` | B0 |
| `Document.supersededById`, `supersededAt`, `deletedAt`, `deletedById` | B1 |
| `DocumentVersion` | B1 |
| `Document.ownerId`, `DocumentSteward`, `Department.defaultOwnerId` | B1 |
| `Document.summaryStatus`, `summaryApprovedById`, `summaryApprovedAt` | B2 |
| `WorkflowDefinition`, `WorkflowStage`, `WorkflowInstance`, `WorkflowTask` | B2 |
| `ReviewPolicy`, `ReviewRecord`, `Document.nextReviewAt`, `lastReviewedAt`, `staleSince` | B3 |

**One migration per PR, merged one at a time** (plan §4.3).
- A also adds `Document` fields (`externalUrl`, `contentType`), so agree all `Document` field names in the review of both documents.
- When Sandeep and Simran both have schema PRs open, the first to merge wins and the other regenerates their migration with `prisma migrate diff --from-url`.

## 4. Packages

### B0: Governance foundations (F2, F5, F4)

**Status:** ready for review. Build in weeks 1–3: F2 and F5 in week 1, F4 in week 3.

**Design:** §3.1, §3.2 and §3.3.

**Files touched:**
- `src/lib/auditLog.js` (shared, B owns it)
- new `src/lib/audit/events.js`, `src/lib/settings/`, `src/lib/notifications/`
- `prisma/schema.prisma`
- header component (bell icon)
- org audit-log page and API
- new Settings → Governance page

**Migration of existing call sites:**
- The 3 existing `logAudit` calls keep working unchanged.
- Replace the classification thresholds read from env vars in `worker/classify.js` with `getSetting`, keeping the env value as the default, so nothing changes until an admin edits it.

**Edge cases:**
- Settings are read inside the worker (outside Next.js): the registry and `getSetting` must import only `prisma`, no Next.js modules.
- An email send failure doesn't fail the action. The in-app notification is still written.
- Audit `before`/`after` must not contain secrets (e.g. SSO client secret). Mask fields named in a deny-list.

**Acceptance tests** (`scripts/ekp/b/b0-*.test.mjs`):
- [ ] `logAudit` with entity fields writes a row that can be queried by document. The old call signature still works. A failing DB write doesn't throw.
- [ ] `getSetting` returns the default when the setting is unset and the stored value after `setSetting`. An invalid value is rejected. A change writes `config.changed` with before/after.
- [ ] A member can't change settings (403). A dept_admin can read but not write.
- [ ] `notify` creates in-app rows for each user, sends email only when the preference allows it, and the unread count updates.

### B1: Document records: decommission, versions, ownership (E23.1–5, E24.1–5)

**Status:** outlined. Detail before week 2.

**Design summary:**
- **Audit on every lifecycle route:** the existing transitions in `lifecycle/route.js`, delete and replace all call F2 with before/after.
- **Supersede:**
  - `POST /api/documents/[id]/supersede { byDocumentId }` (dept_admin of the department or super_admin).
  - Sets `supersededById` / `supersededAt`.
  - The old page shows a "Superseded by …" banner with a link.
- **Versions:**
  - `DocumentVersion` (`documentId`, `version`, `filePath`, `contentHash`, `createdById`, `changeNote`, `createdAt`).
  - `POST /api/documents/[id]/replace` writes the current file as a version row before re-processing, and the old S3 object is kept.
  - A "Versions" tab with view and restore (restore = replace with an old file).
  - SharePoint-synced documents record a version on each content change. The file stays in SharePoint when no-copy mode is on (Workstream A).
- **Soft delete:**
  - `DELETE /api/documents/[id]` sets `deletedAt` / `deletedById` instead of hard-deleting.
  - The `documents.purge-deleted` job (on A's F3) purges after `retention.deletedDays`, including chunks and S3 objects.
  - Admins can restore within the retention period.
  - **v2:** when `retention.deletedDays` is `null`, the purge job does nothing and items stay restorable indefinitely. No retention schedule, legal hold or records-request feature is needed (Q&A #181, #187).
- **Ownership:**
  - `Document.ownerId`, backfilled from `userId`. For SharePoint-synced documents, backfill from the department's `defaultOwnerId` when set, otherwise from the connecting user.
  - `DocumentSteward` (many per document).
  - The `ownership.default` setting decides the owner of new documents.
  - `PATCH /api/documents/[id]/ownership` and `POST /api/org/[orgId]/ownership/bulk-reassign { fromUserId, toUserId, departmentId? }` (admins only).
  - **Bulk reassignment also moves open `WorkflowTask`s** (once B2 exists).

**Edge cases:**
- Superseding with a document from another department, or with the same document: reject.
- Delete of a document that is part of an open workflow: cancel the instance first and audit it.
- An owner removed from the org: the document shows as "no owner" (flag for E28/E31). It's not reassigned automatically.

**Acceptance tests** (E23 and E24 acceptance from the PRS):
- [ ] Archive, retire, supersede, delete and restore each write exactly one audit row with actor, time and before/after.
- [ ] A superseded document isn't returned by search or chat, and its page links to the replacement.
- [ ] Replace keeps the previous version, and restoring it works.
- [ ] A soft-deleted document is invisible everywhere at once and purged only after the retention period.
- [ ] (v2) With `retention.deletedDays = null`, the purge job never removes a soft-deleted document, and it can still be restored.
- [ ] After the backfill, every document has an owner. Bulk reassignment moves documents (and open tasks). Only admins can reassign.

### B2: Publishing: summary review, completeness, workflow engine (E19, E21, E22, E23.6)

**Status:** outlined. Detail before week 3.

**Design summary:**
- **E19:**
  - The worker sets `summaryStatus = "pending_review"` after `createStructuredSummary`.
  - `PATCH /api/documents/[id]/summary { action: "approve" | "edit", text? }` for the owner, a steward or the department admin.
  - Regenerate uses the existing route and resets the status to pending.
  - The UI shows an "AI-generated · pending review" badge and a "Summaries to review" list.
  - **v2:**
    - "Approve" in the list is one click (no edit form).
    - The list supports selecting several summaries and approving them together. Each one writes its own `document.summary_approved` audit row.
    - The publish gate reads `summary.requireApproval` rules per department and category (§3.2). Where approval isn't required, the badge still shows until someone approves.
- **E21:**
  - `src/lib/governance/completeness.js` `checkCompleteness(document, rules)` returns `{ complete, missing[] }`.
  - It's called before every move to `published` (legacy route and engine). If anything is missing, it returns 422 `{ missing }`.
  - A completeness badge ("4 of 5") shows on the document page.
- **F6 engine** (§3.4) + **E22:**
  - Settings → Workflows admin UI (definitions, ordered stages, approver type, any/all, SLA).
  - "Submit for review" moves the document to `in_review` and calls `engine.start`.
  - A "My tasks" inbox.
  - A workflow timeline on the document page.
  - **If no definition matches, the current direct publish by a department admin applies.**
- **E23.6:** a `kind: "decommission"` definition can gate archive, retire and delete. Phase 1 supports it in the engine, plus one admin toggle.

**Interaction with Workstream A:**
- New SharePoint-synced documents arrive as `draft` and are confirmed via the Needs-Review queue (`api/org/[orgId]/needs-review/[docId]/confirm`).
- **Confirming must run the same publish path** (completeness check, and the workflow if one matches), not a separate shortcut.

**Open questions:**
- Existing documents have no `summaryStatus`. Proposed: `null` = "not reviewed (before E19)". The `summary.requireApproval` gate applies only to documents created or replaced after the feature ships.

**Acceptance tests:**
- [ ] A new document shows a pending-review AI description. A reviewer edits and approves it, and the change is audited. A member who isn't the owner can't approve.
- [ ] With "owner" and "category" required, a document missing an owner can't be published, and the UI lists what's missing. Rules apply per department.
- [ ] A 3-stage workflow runs end to end with notifications, and the document publishes only after the final approval, with the full history visible.
- [ ] Rejecting with a comment returns the document to draft. The author can never approve, even if they hold the approver role.
- [ ] With no workflow configured, publishing behaves exactly as today.
- [ ] (v2) With approval required only for one department, that department's document can't publish with a pending summary, but another department's can. Both still show the "AI-generated" badge.
- [ ] (v2) Bulk-approving 3 summaries writes 3 audit rows. A member who isn't the owner, a steward or an admin can't bulk-approve.

### B3: Review cycles and stale content (E25, E26)

**Status:** outlined. Detail before week 5. Needs Workstream A's F3 scheduler. **v2:** NYPA confirms this scope ("should be able to facilitate content reviews for staleness", Q&A #194). No change.

**Design summary:**
- **`ReviewPolicy`:**
  - `orgId`, `name`, `departmentIds[]`, `categories[]`, `intervalDays`, `reviewer` (owner | steward | role), `escalateAfterDays`, `escalateTo`.
  - Each document gets `nextReviewAt` (from the matching policy) and `lastReviewedAt`.
- **`reviews.due-scan` job (daily):**
  - Starts a `kind: "review"` workflow for each due document that has no open review.
  - Notifies the reviewer.
  - Escalates overdue reviews via `engine.escalate`.
- **Outcomes** (stored in `ReviewRecord`):

  | Outcome | Result |
  |---|---|
  | `valid` | sets `lastReviewedAt` and recomputes `nextReviewAt` |
  | `update` | document back to draft, owner notified |
  | `retire` | starts E23 decommissioning |

- **E26:**
  - Move the logic of `scripts/task-8/flag-stale-documents.mjs` into `src/lib/governance/stale.js`, with rules from `stale.rules`.
  - Register it as the `content.stale-scan` job.
  - A stale document gets `staleSince` and **one** review task (no duplicates on later runs).
  - A "May be outdated" badge shows in search results and citations.

**Acceptance tests:**
- [ ] With an annual policy, a document past its date creates a task for its owner. Marking it "still valid" resets the date and records the outcome.
- [ ] An overdue review escalates to the department admin.
- [ ] A document matching a stale rule gets exactly one open review task within one scheduled run, without manual action.

### B4: Governance metrics (E31)

**Status:** outlined. Detail before week 6.

**Design summary:**
- `GET /api/org/[orgId]/governance/metrics?departmentId&from&to` aggregates:
  - review on-time % and overdue reviews by department and owner (E25);
  - items per workflow stage, average approval time and rejection rate (E22);
  - ownership coverage (E24) and completeness (E21);
  - decommission activity over time (E23).
- **Phase 1 UI:** an admin page with tables and CSV export. Workstream D turns it into charts later.

**Acceptance tests:**
- [ ] On seeded workflow and review data, every metric matches a hand-counted expected value. The department filter works. Members get 403.

## 5. Dependencies with Workstream A

| B needs from A | When | A needs from B | When |
|---|---|---|---|
| F1 central access predicate, so `in_review`, `supersededById` and `deletedAt` are filtered everywhere in one place | week 1–2 | F2 `logAudit` with entity fields + event constants | week 1–2 |
| F3 scheduler + job registry | week 3 (B3 jobs from week 5, purge job from week 2 can wait) | F5 `getSetting` | week 3 |
| `Document` field names (`externalUrl`, `contentType`) | review, week 1 | F4 `notify` | week 4 |

## 6. Task Tracker

> **For AI agents and the team:** this table is the source of truth for task status. When you start a task, set `Status` to `IN_PROGRESS` and fill in `Started`. When it's merged to `dev`, set `DONE` and fill in `Completed`. Update it in the same PR. Record important decisions made during implementation as a short note under §7. Design details for each task are in the package section named in its title (§4).

### Status legend

| Symbol | Meaning |
|--------|---------|
| `TODO` | Not started |
| `IN_PROGRESS` | Currently being worked on |
| `REVIEW` | PR open, waiting for review |
| `DONE` | Complete and merged to `dev` |
| `BLOCKED` | Waiting on a dependency or external input |
| `SKIP` | Deferred or out of scope |

Task IDs from the other workstream (e.g. `A-2` in B, `B-2` in A) are cross-workstream dependencies; see §5.

**Assignments** follow the two lanes in §1.1: Sandeep takes lane 1 (audit, decommission, workflow engine, publishing and review workflows), Simran takes lane 2 (settings, notifications, ownership, summary review, completeness, stale content, metrics). Swap tasks between you if needed, and update this table when you do.

Phase 1 integration and cross-testing with Workstream A is task `A-19` (all 3).

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `B-1` | Review this document (shared design + B0); confirm the split (§1.1) | `TODO` | Sandeep & Simran (reviewer: Johurul) | — |Yes |Yes |
| `B-2` | B0 · F2: `AuditLog` entity fields migration, extended `logAudit`, event constants | `TODO` | Sandeep | `B-1` |Yes |Yes |
| `B-3` | B0 · F2: document "History" tab + audit-log filters | `TODO` | Sandeep | `B-2` |Yes |Yes |
| `B-4` | B0 · F5: `OrgSetting` migration, registry, `getSetting`/`setSetting`, Settings → Governance page | `TODO` | Simran | `B-1` |Yes |Yes |
| `B-5` | B0 · F5: move classification/duplicate thresholds from env to settings | `TODO` | Simran | `B-4` |Yes |Yes |
| `B-6` | B1 · E23: audit on lifecycle, delete and replace routes | `TODO` | Sandeep | `B-2` |Yes |Yes|
| `B-7` | B1 · E23: supersede (fields, API, banner) | `TODO` | Sandeep | `B-6`, `A-2` | Yes|Yes|
| `B-8` | B1 · E23: `DocumentVersion` + versions tab + restore | `TODO` | Sandeep | `B-6` | Yes|Yes |
| `B-9` | B1 · E23: soft delete + restore + purge job | `TODO` | Sandeep | `B-6`, `A-2`, `A-7` |Yes |Yes |
| `B-10` | B1 · E24: `ownerId` + backfill, `DocumentSteward`, `defaultOwnerId`, ownership APIs and UI, bulk reassign | `TODO` | Simran | `B-2`, `B-4` |Yes |Yes |
| `B-11` | B0 · F4: `Notification` models, `notify()`, bell, preferences | `TODO` | Simran | `B-1` |Yes |Yes|
| `B-12` | B2 · E19: `summaryStatus`, summary approve/edit API, badge, "Summaries to review" | `TODO` | Simran | `B-10`, `B-11` |Yes |Yes |
| `B-13` | B2 · E21: `completeness.js`, publish gate (legacy route + Needs-Review confirm), badge | `TODO` | Simran | `B-4`, `B-12` | Yes| Yes|
| `B-14` | B2 · F6: workflow models migration + `engine.js` + logic tests (incl. never self-approve) | `TODO` | Sandeep | `B-2`, `B-11` |Yes | Yes|
| `B-15` | B2 · E22: `in_review` state, submit flow, Settings → Workflows admin UI | `TODO` | Sandeep | `B-13`, `B-14` |Yes |Yes |
| `B-16` | B2 · E22: "My tasks" inbox + document workflow timeline | `TODO` | Simran | `B-14` |Yes |Yes |
| `B-17` | B2 · E23.6: decommission approval via the engine | `TODO` | Sandeep | `B-9`, `B-14` |Yes |Pending |
| `B-18` | B3 · E25: `ReviewPolicy`, `ReviewRecord`, `reviews.due-scan` job, outcomes, escalation | `TODO` | Sandeep | `B-14`, `A-7` |Yes | Pending|
| `B-19` | B3 · E26: `stale.js` + `content.stale-scan` job + "May be outdated" badge | `TODO` | Simran | `B-18`, `A-7` |Yes |Pending |
| `B-20` | B4 · E31: governance metrics API + admin page + CSV export | `TODO` | Simran | `B-15`, `B-18` |Yes |Pending |
| `B-21` | End-to-end tests for B + regression run of the Met suites | `TODO` | Sandeep & Simran | `B-15`, `B-16`, `B-17`, `B-19`, `B-20` | | |
| `B-22` | Update RTM status for E19, E21–E26, E31 in the plan | `TODO` | Sandeep & Simran | `B-21`, `A-19` | | |
| `B-23` | (v2) B2 · E19.4: `summary.requireApproval` per department/category rules, one-click approve, bulk approve | `TODO` | Simran | `B-12`, `B-13` | | |
| `B-24` | (v2) B1 · E23.4: `retention.deletedDays = null` means never purge (setting validation, purge job, admin UI) | `TODO` | Sandeep | `B-9` | | |

## 7. Implementation Notes

Add a dated note here when a task changes the design (e.g. `2026-10-20 · A-3: dynamic providers work, fallback not needed`).

- `2026-10-22 · v2 (Johurul):` NYPA's RFP Q&A answers added (see "What changed in v2" at the top). New tasks `B-23` (configurable, lightweight summary review) and `B-24` (never-purge option). Statuses, assignees and completion marks are unchanged from `dev` at `2371067`.
