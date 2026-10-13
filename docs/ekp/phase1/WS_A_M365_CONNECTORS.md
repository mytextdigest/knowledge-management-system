# Workstream A: M365 & Connectors (Phase 1)

| | |
|---|---|
| **Owner** | Johurul |
| **Requirements** | E2, E12, E32 + S2 (Microsoft sign-in, RFP §6) |
| **Foundations owned** | F1 central document access, F3 scheduled jobs |
| **Phase 1 window** | 13 Oct – 22 Nov 2026 (6 weeks, Mon–Sat) |
| **Status** | Shared design + A1 ready for review. A2–A4 outlined; detail each section before it starts. |

**Source documents (don't copy from them, link to them):**
- Requirements and acceptance criteria: [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (E2, E12, E32)
- Architecture and foundations: [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§4 F1, F3; §5.1)
- Plan, workflow and status board: [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md)

**How this document is used:** the shared design (§3) and the first package are reviewed before coding starts. Each later package section is completed and reviewed just before that package starts. Progress is tracked in the task tracker (§6) at the bottom of this file.

## 1. Scope

| Package | Covers (PRS FR numbers) | Foundations | Weeks |
|---|---|---|---|
| **A1** Microsoft sign-in | E32.1, S2 | — | 1–2 (+ SAML in 6) |
| **A2** SharePoint per-file permissions + scheduled sync | E2.2, E2.3, E2.4, E2.5, E2.6, E2.7 | F1, F3 | 1 (F1), 3–4 |
| **A3** SharePoint pages, deep links, SharePoint as master copy | E12.1, E12.3, E12.4, E32.2, E32.3, E32.4, E32.5 | — | 5 |
| **A4** ServiceNow + Content Server connectors | E2.1, E2.8, E12.2 | — | 6 / after award |

**Out of scope for Phase 1:**
- E32.6 tag write-back to SharePoint managed metadata (depends on Workstream C taxonomy).
- SharePoint on-premises (unless NYPA's answers require it; see §2).
- Search ranking changes and search analytics (Workstreams C and D, F7).

## 2. Working Assumptions (until NYPA answers)

NYPA won't register KMS in their tenant or give test access until after the award, so we build against our own test tenant (`nextgenerationinnovation.onmicrosoft.com`, mock org "NGI") and state these assumptions in the proposal. Revisit this table when the answers arrive (expected 19 Oct).

| # | Assumption we build on | Why | Cost if NYPA says otherwise |
|---|---|---|---|
| AS-1 | **SharePoint Online** (M365), not on-premises | NYPA's RFP says "M365"; Graph only covers Online | On-premises needs a different connector (SharePoint REST/CSOM). Large. |
| AS-2 | **Per-file permissions** are enforced (not just per site) | Safest reading of "respects original permissions". Site-level is a subset. | None: per-file also covers site-level. |
| AS-3 | **The customer registers the KMS app in their own Entra tenant** (tenant id, client id, secret/certificate entered in KMS admin settings) | Most utilities don't consent to vendor multi-tenant apps | None: a multi-tenant app can be added later. |
| AS-4 | **OIDC first, SAML 2.0 second** | OIDC is native to NextAuth and Entra. The PRS says SAML "must", so it follows in week 6. | If NYPA mandates SAML only, SAML moves earlier. |
| AS-5 | **No-copy mode on by default** for M365 content (SharePoint stays the master copy) | E32.2 | None. |
| AS-6 | **ServiceNow** built against a free developer instance; **Content Server** designed from OpenText docs and finished after award | No NYPA test systems before award | Content Server may slip past Phase 1 (already accepted in the plan). |

## 3. Shared Design (decided once for the whole workstream)

### 3.1 Identity model

A KMS user can have zero or more external identities. Every ACL check for M365 content goes through the user's Entra object id and their group ids, never through email alone.

```prisma
model UserIdentity {
  id         String   @id @default(cuid())
  userId     String
  provider   String   // "entra"
  tenantId   String
  externalId String   // Entra object id (oid claim)
  email      String?
  createdAt  DateTime @default(now()) @map("created_at")
  lastLoginAt DateTime? @map("last_login_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, tenantId, externalId])
  @@index([userId])
}
```

**Users who sign in with a password (no Entra identity) never see SharePoint items that have an ACL.** This fails closed. Org admins see everything, as today.

### 3.2 F1: Central document access

Build this first (week 1). B's soft-delete and supersede filters also depend on it.

- New module `src/lib/access/documentAccess.js` exporting:
  - `documentAccessSql({ userId, role, principals, alias })`, the only SQL predicate for document visibility;
  - `canAccessDocument(doc, ctx)` and `filterAccessibleDocuments(docs, ctx)`, the JS equivalents;
  - `resolvePrincipals(userId)`, which returns the user's Entra object ids plus transitive group ids, cached for 15 minutes.
- **The predicate is:** today's rule (role, department, lifecycle, visibility) **AND** (the document has no `DocumentAcl` rows **OR** a row matches one of the user's principals).
- **Places to refactor** (D1 in the implementation spec):
  - `vectorSearch.js` (3 copies)
  - `knowledgeContext.js` (`accessSql`)
  - `expertDiscoveryQuery.mjs`
  - `decisionIntelligence.js`
  - `lessonsIntelligence.js`
  - `src/lib/documentAccess.js`
  - route-level checks in `api/documents/[id]/route.js` and the org repository route
- **Delivery in two PRs:**
  1. **Refactor only, no behaviour change.** A parity test (`scripts/ekp/f1-access-parity.test.mjs`) runs every search and query path for each role on the seeded data and asserts identical results before and after.
  2. **Add the ACL clause** (in A2), once `DocumentAcl` exists.
- **Lifecycle values handled in one place:**
  - Workstream B adds `in_review`, `deletedAt` and `supersededById`.
  - F1 owns the default visibility filter (exclude draft, in_review, retired, deleted; exclude superseded by default).
  - B tells A the field names in the review, and A wires them into the predicate.

### 3.3 F3: Scheduled jobs

- **Table:**
  ```prisma
  model ScheduledJob {
    id         String    @id @default(cuid())
    name       String    // handler key, e.g. "sharepoint.sync"
    orgId      String?
    intervalMinutes Int
    enabled    Boolean   @default(true)
    nextRunAt  DateTime  @map("next_run_at")
    lastRunAt  DateTime? @map("last_run_at")
    lastStatus String?   // "ok" | "failed" | "running"
    lastError  String?
    lockedUntil DateTime? @map("locked_until")

    @@unique([name, orgId])
    @@index([enabled, nextRunAt])
  }
  ```
- **Runner:**
  - A loop inside the existing long-running worker (`worker/index.js`), checking every 60 s.
  - It claims due jobs with `SELECT … FOR UPDATE SKIP LOCKED`, sets `lockedUntil`, runs the registered handler, and records the status.
  - Several workers can run safely, and a crashed run is retried after `lockedUntil` expires.
- **Registry:** `src/lib/jobs/registry.js` maps `name` to a handler.
  - A registers `sharepoint.sync` and `sharepoint.acl-refresh`.
  - B registers `content.stale-scan`, `reviews.due-scan` and `documents.purge-deleted`.
- **Intervals rather than cron expressions:** simpler for admins and enough for every Phase 1 job. Cron can be added later.
- **Admin UI:** Settings → Scheduled jobs. It lists jobs with their interval, enabled flag, last run and status, and has a "Run now" button. Only super_admin can use it. Every change is audit-logged (F2, from B).

### 3.4 Connector contract (extended)

`BaseConnector` (`src/lib/connectors/base.js`) gains these methods, which every connector implements:

| Method | Returns | New? |
|---|---|---|
| `listChanges(cursor)` | `{ changes: [{ externalId, name, modifiedAt, size, deleted, webUrl, contentType, permissionsChanged }], cursor }` | extended (`webUrl`, `contentType`, `permissionsChanged`) |
| `downloadFile(externalId)` | `Buffer` | existing |
| `getAcl(externalId)` | `[{ principalType, principalId }]` | **new** |
| `listPages()` / `getPageContent(id)` | page list / `{ title, html, webUrl }` | **new** (SharePoint, A3) |

### 3.5 Data model changes owned by A

| Model / field | Package | Notes |
|---|---|---|
| `UserIdentity` | A1 | §3.1 |
| `ScheduledJob` | A2 | §3.3 |
| `DocumentAcl` | A2 | `documentId`, `principalType` (user / group / tenant), `principalId`, `source`. Indexed on `documentId` and `principalId`. |
| `Document.externalUrl` | A3 | Graph `webUrl` |
| `Document.contentType` | A3 | `file` (default) / `page` / `article` |
| `OrgIntegration` rows with `provider: "entra_sso"`, `"servicenow"`, `"content_server"` | A1, A4 | Uses the existing table (`@@unique([orgId, provider])`). Secrets encrypted with `src/lib/crypto.js`. |

**One migration per PR, merged one at a time** (plan §4.3). B also adds `Document` fields, so agree on all `Document` field names in the review of both documents.

## 4. Packages

### A1: Microsoft sign-in (E32.1, S2)

**Status:** ready for review. Build in weeks 1–2.

**Finding that shapes the design:**
- `src/lib/auth.js` configures `PrismaAdapter(prisma)`, but the schema has no `Account`, `Session` or `VerificationToken` models.
- It works today only because Credentials providers bypass the adapter.
- An OAuth/OIDC provider would call `adapter.getUserByAccount` and fail.

**Decision (for review):**
- **Remove the adapter.**
- Create and link users ourselves in the `signIn` callback, using `UserIdentity`.
- This keeps one explicit code path and avoids adding three NextAuth tables we wouldn't otherwise use.

**Design:**
1. **Per-org SSO configuration:**
   - stored in `OrgIntegration` with `provider: "entra_sso"`;
   - `scopeConfig` holds `{ tenantId, clientId, allowedDomains[], groupRoleMap }`;
   - the client secret is encrypted in `accessToken` via `crypto.js`, as SharePoint does today;
   - Admin UI: Settings → Single sign-on (super_admin only), with a "Test connection" button.
2. **Dynamic provider:**
   - The NextAuth route handler builds `authOptions` per request.
   - It adds one `AzureADProvider` per org with SSO enabled (`id: "entra-<orgId>"`, `tenantId` from config), cached for 5 minutes.
   - Static Credentials and OTP providers stay unchanged.
   - **Spike on day 1:** confirm the NextAuth v4 advanced initialisation works with the App Router handler. If it doesn't, the fallback is one provider per deployment configured from env (fine for a single-tenant NYPA deployment).
3. **Home realm discovery:**
   - The login page asks for the email first.
   - If its domain matches an org's `allowedDomains`, the page shows "Continue with Microsoft". Otherwise it shows the password form.
4. **`signIn` callback:**
   - Check that the token's `tid` matches the org's configured tenant.
   - Find `UserIdentity` by (`entra`, `tid`, `oid`).
   - If there's no identity, match an existing `User` by email (Entra email or `preferred_username`, lower-cased) and link it.
   - If there's no user, create one just in time, with `emailVerified: true` and no password.
   - Ensure an `OrganizationMember` row exists.
   - Update `lastLoginAt`.
   - Audit-log `auth.sso_login` and `auth.sso_user_created` (F2).
5. **Role mapping:**
   - `groupRoleMap: [{ groupId, role, departmentIds[] }]`, applied at each login from the token's `groups` claim.
   - **The highest mapped role wins.**
   - **If no group matches, the existing manual role is kept** (fallback), and new users become `member`.
   - **Group overage:** if a user is in more than 200 groups, Entra omits the claim, so fetch the groups via Graph `/me/transitiveMemberOf` using the sign-in access token.
6. **Session:** the JWT carries `userId` and `entraOid` so that A2's `resolvePrincipals` doesn't need a lookup.
7. **SAML 2.0 (week 6):** evaluate BoxyHQ SAML Jackson as a SAML-to-OIDC bridge, so the same `signIn` path is reused. Decide in week 5 based on NYPA's answer to Q4.

**Files touched:**
- `src/lib/auth.js` (shared, A owns it)
- `src/app/api/auth/[...nextauth]/route.js`
- login page and components
- new `src/lib/sso/entra.js`
- new admin settings page and API `api/org/[orgId]/sso`

**Edge cases:**
- The same email exists in two orgs: the identity links to the user, and membership is per org (already how KMS works).
- A user is removed from all mapped groups: keep their membership but downgrade them to `member`. **Never auto-delete users.**
- The secret expires or is rotated: "Test connection" fails visibly, and password login still works for super_admins.
- A guest (B2B) account in NYPA's tenant has `#EXT#` in the UPN: use the `email` claim, not the UPN.

**Open questions:**
- Do we allow password login for SSO-enabled domains? Proposed: no for members, yes for super_admin as a break-glass account.

**Acceptance tests** (`scripts/ekp/a/a1-sso.*.test.mjs` + manual test-tenant checklist):
- [ ] A test-tenant user signs in with Microsoft. A KMS user and `UserIdentity` are created, and they land in the right org.
- [ ] An existing password user with the same email signs in with Microsoft and is linked, not duplicated.
- [ ] A user in a mapped Entra group gets the mapped role and departments. Removing them from the group downgrades them at the next login.
- [ ] A token from another tenant is rejected.
- [ ] Every SSO login and every user creation is in the audit log.
- [ ] Password and OTP login still work (regression).

### A2: SharePoint per-file permissions + scheduled sync (E2.2–E2.7)

**Status:** outlined. Detail before week 3. F1 refactor (§3.2) in week 1, F3 (§3.3) in week 3.

**Design summary:**
- **ACL capture:**
  - In `syncOneFile` (`worker/index.js`), call `connector.getAcl(itemId)` → Graph `GET /drives/{d}/items/{i}/permissions`.
  - Replace the document's `DocumentAcl` rows in the same transaction as the document update.
  - Map:
    - `grantedToV2.user` → `user`;
    - `grantedToV2.group` → `group`;
    - organization-scoped sharing links → `tenant:<tid>`.
- **Permission-only changes:** request delta with `Prefer: deltashowsharingchanges, hierarchicalsharing` (to verify in the test tenant). Items flagged as permission changes only re-fetch their ACL and don't re-download the file.
- **Safety net:** `sharepoint.acl-refresh` job (F3), a full ACL pass daily.
- **Enforcement:** the F1 predicate gains the ACL clause.
  - `resolvePrincipals(userId)`: `UserIdentity.externalId` + Graph `/users/{oid}/transitiveMemberOf` (app-only token), plus `tenant:<tid>`.
  - Cached for 15 minutes.
- **Scheduled sync:** register `sharepoint.sync` per org. The interval comes from the integration settings (default 60 min, NFR-6). "Sync Now" stays.
- **Graph permissions:** document exactly what NYPA's admin must grant (`Sites.Selected` + whatever reading item permissions and group membership needs). Verify in the test tenant.

**Known risks:**
- **SharePoint site groups** (Owners / Members / Visitors) appear as `siteGroup` principals. Graph doesn't expand them.
  - Option 1: SharePoint REST `/_api/web/sitegroups(id)/users`.
  - Option 2: treat them as the site's Microsoft 365 group (correct for group-connected sites).
  - **Spike in week 3.**
- **"Anyone" links:** map to `tenant:<tid>` (members of the KMS org only), never public.
- **Performance:** 1 permissions call per item. The 5,000-item load test is part of the acceptance tests.

**Acceptance tests:**
- [ ] File shared with user A only: A sees it in search, chat, citations, recommendations, graph and preview. B never does.
- [ ] Removing A's access in SharePoint removes it from A's results after the next scheduled sync, with no manual action.
- [ ] Access granted via an Entra group works, and removing the user from the group revokes it.
- [ ] A password-only user sees no ACL-restricted items.
- [ ] Sync history shows each scheduled run. A 5,000-item sync completes without errors.
- [ ] The F1 parity test still passes for all non-SharePoint documents.

### A3: SharePoint pages, deep links, SharePoint as master copy (E12.1, E12.3–4, E32.2–5)

**Status:** outlined. Detail before week 5.

**Design summary:**
- **Deep links:**
  - Store Graph `webUrl` in `Document.externalUrl` on every sync.
  - Backfill existing SharePoint documents on the next sync.
  - The UI shows "Open in SharePoint" on the document page, search cards and citations.
- **No-copy mode:**
  - `OrgSetting` `sharepoint.storeOriginals` (default `false`).
  - When false, the worker processes the downloaded `Buffer` in memory, skips `PutObjectCommand`, and skips the storage-usage delta. `filePath` stays null.
  - **The processing path that today reads from S3 by `filePath` needs a `getDocumentBytes(doc)` helper:** S3 when `filePath` is set, Graph otherwise.
- **On-demand preview:**
  - `GET /api/documents/[id]/preview` streams from Graph when there's no S3 copy.
  - It checks access with F1 first.
- **Site pages:**
  - `listPages()` uses Graph `/sites/{id}/pages` (`$expand=canvasLayout`). Classic wiki pages come from the Site Pages library.
  - Pages are converted from HTML to text and saved as `contentType: "page"`.
  - ACLs are captured as in A2.
  - Pages are included per site with an include/exclude option in `scopeConfig`.

**Acceptance tests:**
- [ ] A modern page and a wiki page are searchable and citable, with a link back to the original.
- [ ] With no-copy on, a synced file leaves no S3 object, and its preview still works.
- [ ] Edit in SharePoint → updated in KMS after the next sync (E32 acceptance).

### A4: ServiceNow + Content Server connectors (E2.1, E2.8, E12.2)

**Status:** outlined. Detail before week 6. Depends on NYPA's answers to Q3 and Q6.

**Design summary:**
- **`ServiceNowConnector`:**
  - Table API `kb_knowledge` (published articles), incremental by `sys_updated_on`.
  - Saved as `contentType: "article"`.
  - ACL from the article's knowledge-base user criteria, mapped to `DocumentAcl` (approach to confirm on the developer instance).
- **`ContentServerConnector`:**
  - Interface and design from the OpenText REST API v2 docs.
  - Implementation and tests after NYPA provides an instance.
- **One ranked result list:** all sources already land in the same `Document` / `Chunk` index, so E2.1 only needs a source label and filter in the UI.

**Acceptance tests:**
- [ ] A ServiceNow KB article from the developer instance is searchable and citable, with a link back to the original. User-criteria restrictions are enforced.
- [ ] Results from SharePoint, ServiceNow and manual uploads appear in one list, labelled by source.

## 5. Dependencies with Workstream B

| A needs from B | When | B needs from A | When |
|---|---|---|---|
| F2 `logAudit` with `entityType`/`entityId` | week 2 (A1 audit events) | F1 predicate in place, so soft delete, supersede and `in_review` are filtered everywhere | week 1–2 |
| F5 `getSetting` (`sharepoint.storeOriginals`, sync interval) | week 3 | F3 scheduler and job registry | week 3 (B's stale/review jobs from week 5) |
| F4 `notify` (sync failure alerts to admins) | week 4 (optional) | `Document` field names agreed (`externalUrl`, `contentType`) | review, week 1 |

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

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `A-1` | Finalize this document (shared design + A1) | `TODO` | Johurul | — | | |
| `A-2` | A2 · F1: consolidate the access predicate into `src/lib/access/documentAccess.js` (no behaviour change) + parity test | `TODO` | Johurul | `A-1` | | |
| `A-3` | A1 · Spike: NextAuth dynamic per-org Entra provider in the App Router | `TODO` | Johurul | `A-1` | | |
| `A-4` | A1 · `UserIdentity` migration; remove `PrismaAdapter` | `TODO` | Johurul | `A-3` | | |
| `A-5` | A1 · Entra OIDC sign-in: SSO config API + admin page, `signIn` callback, JIT user, home realm discovery | `TODO` | Johurul | `A-4`, `B-2` | | |
| `A-6` | A1 · Group → role/department mapping, including group overage | `TODO` | Johurul | `A-5` | | |
| `A-7` | A2 · F3: `ScheduledJob` migration, worker scheduler loop, job registry, admin page | `TODO` | Johurul | `A-1` | | |
| `A-8` | A2 · Spike: SharePoint site-group expansion + `deltashowsharingchanges` in the test tenant | `TODO` | Johurul | `A-1` | | |
| `A-9` | A2 · `DocumentAcl` migration + ACL capture in sync | `TODO` | Johurul | `A-2`, `A-8` | | |
| `A-10` | A2 · F1 ACL clause + `resolvePrincipals` (cached) | `TODO` | Johurul | `A-6`, `A-9` | | |
| `A-11` | A2 · Scheduled `sharepoint.sync`, permission-only re-sync, daily `acl-refresh` | `TODO` | Johurul | `A-7`, `A-9`, `B-4` | | |
| `A-12` | A2 · End-to-end permission tests + 5,000-item load test | `TODO` | Johurul | `A-10`, `A-11` | | |
| `A-13` | A3 · `externalUrl` + "Open in SharePoint" in the UI | `TODO` | Johurul | `A-9` | | |
| `A-14` | A3 · No-copy mode + `getDocumentBytes` + preview endpoint | `TODO` | Johurul | `A-13`, `B-4` | | |
| `A-15` | A3 · SharePoint site pages ingestion (`contentType: page`) | `TODO` | Johurul | `A-9` | | |
| `A-16` | A1 · SAML 2.0 support (decide after NYPA's Q4 answer) | `TODO` | Johurul | `A-5` | | |
| `A-17` | A4 · ServiceNow connector (developer instance) | `TODO` | Johurul | `A-9` | | |
| `A-18` | A4 · Content Server connector: design now, build after award | `TODO` | Johurul | `A-9` | | |
| `A-19` | Phase 1 integration & cross-testing (A + B together, all roles) | `TODO` | All 3 | `A-12`, `A-15`, `B-21` | | |
| `A-20` | Update RTM status for E2, E12, E32 in the plan; re-score Phase 1 | `TODO` | Johurul | `A-19` | | |

## 7. Implementation Notes

Add a dated note here when a task changes the design (e.g. `2026-10-20 · A-3: dynamic providers work, fallback not needed`).
