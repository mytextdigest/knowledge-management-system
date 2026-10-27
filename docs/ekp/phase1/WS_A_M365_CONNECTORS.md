# Workstream A: M365 & Connectors (Phase 1)

|                             |                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**             | Johurul                                                                                                                                              |
| **Requirements**      | E2, E12, E32 + S2 (Microsoft sign-in, RFP §6)                                                                                                       |
| **Foundations owned** | F1 central document access, F3 scheduled jobs                                                                                                        |
| **Phase 1 window**    | 13 Oct – 22 Nov 2026 (6 weeks, Mon–Sat)                                                                                                            |
| **Status**            | Shared design + A1 decided (updated 15 Oct, see §7). A2–A3 outlined; detail each section before it starts. Content Server deferred to after award. |

**Source documents (don't copy from them, link to them):**

- Requirements and acceptance criteria: [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (E2, E12, E32)
- Architecture and foundations: [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§4 F1, F3; §5.1)
- Plan, workflow and status board: [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md)

**How this document is used:** the shared design (§3) and the first package are reviewed before coding starts. Each later package section is completed and reviewed just before that package starts. Progress is tracked in the task tracker (§6) at the bottom of this file.

## 1. Scope

| Package                                                                     | Covers (PRS FR numbers)                         | Foundations | Weeks                               |
| --------------------------------------------------------------------------- | ----------------------------------------------- | ----------- | ----------------------------------- |
| **A1** Microsoft sign-in (OIDC, then SAML 2.0)                        | E32.1, S2                                       | —          | 1–2 (OIDC), 3 (SAML)               |
| **A2** SharePoint per-file permissions + scheduled sync               | E2.2, E2.3, E2.4, E2.5, E2.6, E2.7              | F1, F3      | 1 (F1), 2 (identity by email), 3–4 |
| **A3** SharePoint pages, deep links, SharePoint as master copy        | E12.1, E12.3, E12.4, E32.2, E32.3, E32.4, E32.5 | —          | 5                                   |
| **A4** ServiceNow connector (stretch) · Content Server (after award) | E2.1, E2.8, E12.2                               | —          | 6 (stretch) / after award           |

**Out of scope for Phase 1:**

- E32.6 tag write-back to SharePoint managed metadata (depends on Workstream C taxonomy).
- SharePoint on-premises. NYPA confirmed it's SharePoint Online only (Q&A #108).
- Search ranking changes and search analytics (Workstreams C and D, F7).
- **Content Server connector build** (design note only). It runs in NYPA's **private cloud** (CE 25.4), and NYPA allows a connector to be installed inside its network (Q&A #114, #161). There's no test instance before award, and NYPA confirms it can be added after launch (Q&A #66). The network path is still an architecture decision for after award.
- OAuth/token authentication for KMS APIs (the "OAuth for APIs" half of S2): Workstream G.
- **E32.7: KMS search and answers inside M365 Copilot Chat** (API, MCP server or Copilot connector; Q&A #47). New in PRS v1.1. It's planned for after Phase 1, and NYPA's M365 Governance Review Team must approve the connection pattern.
- **PowerPoint, video and VTT text extraction** (E11). These are Phase 2 (Workstream E). Until then, sync must not choke on large videos (`A-24`).

## 2. Working Assumptions (until NYPA answers)

NYPA won't register KMS in their tenant or give test access until after the award, so we build against our own test tenant (`nextgenerationinnovation.onmicrosoft.com`, mock org "NGI") and state these assumptions in the proposal.

**We didn't send our questions, but NYPA's answers to other vendors (published 2026-10-22, `docs/ekp/Attachment 5 - Q+A format NYPA Response.xlsx`) settle most of them.** The "NYPA's answer" column below records them. After award, NYPA's design team will still review the design. Keep each assumption behind one setting or one module so it can change without a rewrite.

| #    | Assumption we build on                                                                                                                                                                                                                                                                                                                                                                                | Why                                                                                                                                                                                                                                                                    | Cost if NYPA says otherwise                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | **SharePoint Online** (M365), not on-premises                                                                                                                                                                                                                                                                                                                                                   | NYPA's RFP says "M365"; Graph only covers Online                                                                                                                                                                                                                       | On-premises needs a different connector (SharePoint REST/CSOM). Large.                                                                   |
| AS-2 | **Per-file permissions** are enforced (not just per site)                                                                                                                                                                                                                                                                                                                                       | Safest reading of "respects original permissions". Site-level is a subset.                                                                                                                                                                                             | None: per-file also covers site-level.                                                                                                   |
| AS-3 | **Two multi-tenant KMS apps in Entra, one per purpose:** (1) the existing **SharePoint connector app** (`MSGRAPH_CLIENT_ID`), used by org admins at connect time and by the worker for sync and permission lookups; (2) a new **KMS Sign-in app** (`ENTRA_SSO_CLIENT_ID`), used by every user to sign in, with sign-in scopes only. The customer's admin consents to each once. | Least privilege: the app every user touches holds no data permissions, and its secret lives only in the web app. The customer can assign sign-in to users/groups and apply Conditional Access without affecting sync. SSO and SharePoint can be enabled independently. | If NYPA refuses vendor multi-tenant apps, support customer-registered apps (tenant id, client id, secret in org settings). About 2 days. |
| AS-4 | **SAML 2.0 is required** (RFP §6 S2 says "Login with NYPA Active Directory (SAML)"; PRS E32.1 says SAML must, OIDC may). **Build OIDC first** (weeks 1–2) because it's native to NextAuth and proves the shared sign-in path; **SAML follows in week 3** on the same path.                                                                                                        | Fastest route to a working Microsoft login, and SAML is still delivered in Phase 1                                                                                                                                                                                     | If NYPA accepts OIDC, SAML stays as a checkbox feature. If NYPA requires SAML only, nothing changes.                                     |
| AS-5 | **No-copy mode on by default** for M365 content (SharePoint stays the master copy)                                                                                                                                                                                                                                                                                                              | E32.2                                                                                                                                                                                                                                                                  | None.                                                                                                                                    |
| AS-6 | **ServiceNow** (Phase 1 stretch) built against a free developer instance, Knowledge Base articles only, permissions per knowledge base mapped to a KMS department. **Content Server** deferred to after award.                                                                                                                                                                            | No NYPA test systems before award; ServiceNow and Content Server are "target capability", not mandatory                                                                                                                                                                | Per-article ServiceNow user criteria and incidents/problems (Q6) are added after award.                                                  |
| AS-7 | **Entra ID is NYPA's identity provider for all KMS users**, including contractors (as B2B guests)                                                                                                                                                                                                                                                                                               | Needed so every user can be mapped to SharePoint permissions                                                                                                                                                                                                           | Users outside Entra can still sign in with a password but see no permission-restricted M365 items.                                       |

**NYPA's answers (2026-10-22):**

| #    | NYPA's answer                                                                                                                                                                                                                                                                                       | Effect                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | **Confirmed.** SharePoint Online in an M365 G5 **GCC** tenant, not GCC High (Q&A #108). Azure is believed to be Commercial.                                                                                                                                                                          | No change. GCC uses the standard `graph.microsoft.com` and `login.microsoftonline.com` endpoints, so nothing built so far needs to change.                     |
| AS-2 | **Not answered directly.** Whether to read sources with an application identity or as the signed-in user is "to be determined with NYPA architecture/cyber stakeholders during solution design" (Q&A #179). The EKB is open to all users and no CEII is in scope (Q&A #102, #140). | Keep per-file permissions (A-9 to A-11). The app-only model we built is one of the two options NYPA named.                                                    |
| AS-4 | **Not answered.**                                                                                                                                                                                                                                                                                     | Keep OIDC (done) and SAML (A-16).                                                                                                                              |
| AS-6 | **ServiceNow confirmed and simpler.** Knowledge Base only; the main KB "is accessible to all users"; no script-based user criteria (Q&A #126). Release "Australia" (Q&A #161). Can be added after launch (Q&A #66). **Content Server:** CE 25.4 in NYPA's private cloud, connector installable inside NYPA's network, **OpenText Extended ECM for M365** in use (Q&A #114, corrected 10/22; #161). | Mapping each knowledge base to a department is enough. **Per-article user criteria are dropped**, not deferred (see A4). Content Server stays after award. |
| AS-7 | **Confirmed.** Entra ID is the identity provider. NYPA and Canals are in one tenant (Q&A #179). Their content doesn't need to be kept separate (Q&A #110).                                                                                                                                             | One tenant maps to one KMS org, which is how A1 is built.                                                                                                     |

**Other NYPA answers that affect A:**
- **Sync freshness:** NYPA asked for changes within **5 minutes** (Q&A #99), and also said "scheduled indexing should be ok" (Q&A #46). The scheduler's minimum interval goes from 15 to 5 minutes (`A-22`, NFR-6).
- **In-scope SharePoint content:** the EKB site (~1,000 documents and ~300 videos) plus 7 other sites (~150 items), about 1,500 files, mostly **PPT, PDF and MP4**, with VTT/Word transcripts (Q&A #132, #44, #185). NYPA picks the subsets to index (Q&A #94). Content stays in SharePoint; no bulk migration (Q&A #58, #160). This supports no-copy mode (A-14).
- **Large files:** videos are up to **8 GB** (Q&A #188). The sync and no-copy path load whole files into memory, so A-24 adds a size guard.
- **Existing tags:** Semaphore has already tagged ~250,000 items across 60 sites into SharePoint managed-metadata columns (Q&A #128). The sync should keep those values (`A-23`, PRS E16.5) so Workstream C can map them to terms.
- **Recordings** stay in the organizer's OneDrive unless someone moves them to SharePoint (Q&A #159). Only SharePoint sites are in scope for the connector.

## 3. Shared Design (decided once for the whole workstream)

### 3.1 Identity model

A KMS user can have zero or more external identities. Every ACL check for M365 content goes through the user's Entra object id and their group ids. Email is used only to *find* the object id, never as the ACL principal itself.

**Two ways an identity is created**, so per-file permissions don't wait for SSO:

| `source`      | How                                                                                                                                                                                                                                                                                   | Trust                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sso`         | User signs in with Microsoft (OIDC or SAML). The `oid` comes from the signed token.                                                                                                                                                                                                 | Exact. Always wins.                                                                         |
| `email_match` | For a user with `emailVerified: true` in an org that has a SharePoint integration, look up the verified email in that org's tenant with Graph app-only: `GET /users?$filter=mail eq '<email>' or userPrincipalName eq '<email>'`. Exactly one enabled match → store its `oid`. | Good: the email is OTP-verified in KMS. Replaced by `sso` on the first Microsoft sign-in. |

**`email_match` rules:**

- Only for verified emails; zero or several matches → no identity (fails closed).
- Re-checked by the `sharepoint.acl-refresh` job (F3). If the Entra account is disabled (`accountEnabled: false`) or gone, the identity is deleted.
- Needs app-only Graph permission `User.Read.All` (plus `GroupMember.Read.All` for group resolution in A2), on the **SharePoint connector app**, granted in the same admin consent as `Sites.Selected`. The Sign-in app never gets these.

```prisma
model UserIdentity {
  id         String   @id @default(cuid())
  userId     String
  provider   String   // "entra"
  source     String   // "sso" | "email_match"
  tenantId   String
  externalId String   // Entra object id (oid claim / Graph user id)
  email      String?
  createdAt  DateTime @default(now()) @map("created_at")
  lastLoginAt DateTime? @map("last_login_at")
  verifiedAt DateTime? @map("verified_at") // last email_match check

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, tenantId, externalId])
  @@index([userId])
}
```

**Users with no Entra identity (neither `sso` nor `email_match`) never see SharePoint items that have an ACL.** This fails closed. Org admins see everything, as today.

### 3.2 F1: Central document access

Build this first (week 1). B's soft-delete and supersede filters also depend on it.

- New module `src/lib/access/documentAccess.js` exporting:
  - `documentAccessSql({ userId, role, principals, alias })`, the only SQL predicate for document visibility;
  - `canAccessDocument(doc, ctx)` and `filterAccessibleDocuments(docs, ctx)`, the JS equivalents;
  - `resolvePrincipals(userId)`, which returns the user's Entra object ids (from `UserIdentity`, either source) plus transitive group ids, cached for 15 minutes.
- **The predicate is:** today's rule (role, department, lifecycle, visibility) **AND** (the document has no `DocumentAcl` rows **OR** a row matches one of the user's principals).
- **Places refactored in A-2:**
  - `vectorSearch.js` (3 copies) and `decisionIntelligence.js` → `searchAccessSql`
  - `knowledgeContext.js` / `knowledgeGraph.js` (`accessSql`) → `knowledgeAccessSql`
  - chat workflow document (`api/org/[orgId]/chat`) → `searchAccessWhere`
  - org repository listing → `repositoryAccessWhere`
  - document page (`api/documents/[id]`) → `canViewDocument`
  - interactions route → `canInteractWithDocument`
  - `decisionAccess.js` → `canAccessDocument`
  - `src/lib/documentAccess.js` (timelines) → moved as `filterAccessibleDocuments`; old file deleted
- **Not moved:** `expertDiscoveryQuery.mjs` has a topic-level rule (viewer *and* expert must be connected to the document); A-10 adds the ACL clause there directly. `lessonsIntelligence.js` checks lessons, not documents, so it's out of F1.
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
- **Minimum interval: 5 minutes** (changed from 15 on 2026-10-23; NFR-6, Q&A #99). Delta sync makes a 5-minute `sharepoint.sync` cheap when nothing has changed. The scheduler's 60 s tick is unchanged.
- **Admin UI:** Settings → Scheduled jobs. It lists jobs with their interval, enabled flag, last run and status, and has a "Run now" button. Only super_admin can use it. Every change is audit-logged (F2, from B).

### 3.4 Connector contract (extended)

`BaseConnector` (`src/lib/connectors/base.js`) gains these methods, which every connector implements:

| Method                                   | Returns                                                                                                             | New?                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `listChanges(cursor)`                  | `{ changes: [{ externalId, name, modifiedAt, size, deleted, webUrl, contentType, permissionsChanged }], cursor }` | extended (`webUrl`, `contentType`, `permissionsChanged`) |
| `downloadFile(externalId)`             | `Buffer`                                                                                                          | existing                                                       |
| `getAcl(externalId)`                   | `[{ principalType, principalId }]`                                                                                | **new**                                                  |
| `listPages()` / `getPageContent(id)` | page list / `{ title, html, webUrl }`                                                                             | **new** (SharePoint, A3)                                 |

### 3.5 Data model changes owned by A

| Model / field                                          | Package   | Notes                                                                                                                                                                                                                      |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserIdentity`                                       | A1        | §3.1                                                                                                                                                                                                                      |
| `ScheduledJob`                                       | A2        | §3.3                                                                                                                                                                                                                      |
| `DocumentAcl`                                        | A2        | `documentId`, `principalType` (user / group / tenant), `principalId`, `source`. Indexed on `documentId` and `principalId`.                                                                                     |
| `Document.externalUrl`                               | A3        | Graph `webUrl`                                                                                                                                                                                                           |
| `Document.contentType`                               | A3        | `file` (default) / `page` / `article`                                                                                                                                                                                |
| `OrgSsoConfig`                                       | A1        | One row per org; `tenantId` unique (one tenant ↔ one org, indexed lookup by the token's `tid`). Stores no secret (KMS Sign-in app credentials are in env). Migration `20261016000000_ekp_user_identity_sso_config`. |
| `OrgIntegration` row with `provider: "servicenow"` | A4        | Uses the existing table. Credentials encrypted with `src/lib/crypto.js`.                                                                                                                                                 |
| SAML Jackson tables                                    | A1 (SAML) | Created by `@boxyhq/saml-jackson` itself, **in a separate Postgres schema `jackson`**, not in Prisma's schema, so `prisma migrate diff` doesn't report them as drift.                                          |

**One migration per PR, merged one at a time** (plan §4.3). B also adds `Document` fields, so agree on all `Document` field names in the review of both documents.

## 4. Packages

### A1: Microsoft sign-in (E32.1, S2)

**Status:** decided. OIDC in weeks 1–2, SAML in week 3.

**What it is:** a "Sign in with Microsoft" option alongside email/password and OTP. Users sign in with their Entra ID work account and their organization's MFA. It doesn't change documents, search, chat, departments or the worker.

**Finding that shapes the design:**

- `src/lib/auth.js` configures `PrismaAdapter(prisma)`, but the schema has no `Account`, `Session` or `VerificationToken` models.
- It works today only because Credentials providers bypass the adapter.
- An OAuth/OIDC provider would call `adapter.getUserByAccount` and fail.

**Decision:**

- **Remove the adapter.** Create and link users ourselves in the `signIn` callback, using `UserIdentity`. One explicit code path, no unused NextAuth tables.
- **A separate multi-tenant KMS Sign-in app** (AS-3), not the SharePoint connector app. No per-org client id or secret, and no dynamic per-org providers.

**Design:**

1. **App registration (once, new "KMS Sign-in" app in our tenant, multi-tenant, "Accounts in any organizational directory"):**
   - add the NextAuth redirect URIs (`/api/auth/callback/azure-ad` for each environment);
   - delegated scopes `openid profile email User.Read`;
   - optional claims `email`, and `groupMembershipClaims: "SecurityGroup"` so tokens carry group ids.
2. **Static provider:** one `AzureADProvider` (`id: "azure-ad"`, `tenantId: "organizations"`, client id/secret from new `ENTRA_SSO_CLIENT_ID` / `ENTRA_SSO_CLIENT_SECRET` env). Personal Microsoft accounts are excluded, as in `msGraph.js`.
3. **Per-org SSO configuration:**
   - Stored in `OrgSsoConfig` (`orgId`, unique `tenantId`, `protocol: "oidc" | "saml"`, `allowedDomains[]`, `groupRoleMap`, `passwordLogin: "admins_only" | "all"`, `provisioning: "auto" | "invite_only"`, `enabled`). Not `OrgIntegration`: that table requires an access token and can't index the tenant id inside its JSON.
   - **Registration flow:** a KMS super_admin clicks "Connect Microsoft" → Microsoft's admin-consent page for the KMS Sign-in app (needs an Entra admin of that tenant) → back to KMS with the `tenant`. KMS then signs the admin in and reads the tenant's **verified domains** (Graph `/organization`, allowed by `User.Read`). The admin picks `allowedDomains` from that list only, so an org can never claim a domain it doesn't own.
   - **One tenant maps to one KMS org.** Connecting a tenant already used by another org is refused.
   - `provisioning: "auto"` (default): any user of the tenant who signs in joins the org as `employee`. `"invite_only"`: only users with a pending invite or existing membership get in. The customer can also limit who may sign in through "Assignment required" on the enterprise app in Entra.
   - `tenantId` is filled in automatically when an admin of that tenant completes the Sign-in app's admin-consent flow (`/adminconsent` returns `tenant`). It must equal the tenant of the org's SharePoint integration when both are enabled; the settings page shows a warning if they differ.
   - In their tenant, the customer can set "Assignment required" on the KMS Sign-in enterprise app to limit who can sign in, and apply Conditional Access (MFA, compliant device) to it. Neither affects SharePoint sync.
   - Admin UI: Settings → Single sign-on (super_admin only), with a "Test sign-in" button.
4. **Home realm discovery:**
   - The login page asks for the email first.
   - If its domain matches an org's `allowedDomains`, the user is sent straight to Microsoft (already signed in to Microsoft → no prompt, just their MFA policy). Otherwise it shows the password form.
   - A plain "Sign in with Microsoft" button is also shown for users who don't type an email first.
   - **Sign-up:** an email on an SSO domain is sent to Microsoft instead of creating a password account. Other emails sign up as today.
5. **`signIn` callback** (same code for OIDC and SAML):
   - Find the org whose `OrgSsoConfig.tenantId` is the token's `tid`. **No match → reject** with "Your organization hasn't set up Microsoft sign-in for KMS. Sign in with your email and password, or ask your administrator." The user isn't blocked from KMS, only from the Microsoft button.
   - Find `UserIdentity` by (`entra`, `tid`, `oid`).
   - If there's none, match an existing `User` by email (`email` claim, lower-cased; `preferred_username` only if it's not a `#EXT#` guest UPN) and link it, **but only if the email's domain is in the org's `allowedDomains`** (verified for that tenant). Entra's `email` attribute can be set to any value by a tenant admin, so linking on email alone would let another tenant take over an account ("nOAuth"). Otherwise create a new user. An existing `email_match` identity for the same `oid` is upgraded to `source: "sso"`.
   - If there's no user, create one just in time, with `emailVerified: true` and no password.
   - Ensure an `OrganizationMember` row exists. Update `lastLoginAt`.
   - Audit-log `auth.sso_login` and `auth.sso_user_created` with today's `logAudit`; switch to `entityType`/`entityId` when B-2 lands.
6. **Role mapping:**
   - `groupRoleMap: [{ groupId, role, departmentIds[] }]`, applied at each login from the token's `groups` claim.
   - **The highest mapped role wins.**
   - **If no group matches, the existing manual role is kept**, and new users become `employee` (KMS's default org role).
   - **Group overage:** if a user is in more than 200 groups, Entra omits the claim, so fetch the groups via Graph `/me/transitiveMemberOf` using the sign-in access token.
7. **Password login for SSO orgs:** `passwordLogin: "admins_only"` (default once SSO is on) blocks password/OTP for members and keeps it for super_admins as break-glass.
8. **Session:** the JWT carries `userId` and `entraOid` so that A2's `resolvePrincipals` doesn't need a lookup.
9. **SAML 2.0 (week 3):**
   - Embed `@boxyhq/saml-jackson` as a library inside Next.js API routes (no extra service), storing its data in the `jackson` Postgres schema.
   - NextAuth's built-in `BoxyHQSAMLProvider` talks to it as if it were an OIDC provider, so the `signIn` callback (step 5) is reused unchanged.
   - Per org, the admin uploads the IdP metadata XML from their Entra "Enterprise application (SAML)" in Settings → Single sign-on (`protocol: "saml"`). Jackson connection `tenant = orgId`, `product = "kms"`.
   - Entra must send the `objectidentifier` and `tenantid` claims (and `groups` for role mapping). Document this in the admin setup guide.
   - Verify end to end with a SAML enterprise app in our test tenant.

**Files touched:**

- `src/lib/auth.js` (shared, A owns it)
- `src/app/api/auth/[...nextauth]/route.js`, new `src/app/api/auth/saml/*` (Jackson endpoints)
- login page and components
- new `src/lib/sso/entra.js`, `src/lib/sso/jackson.js`
- new admin settings page and API `api/org/[orgId]/sso`

**Edge cases:**

- The same email exists in two orgs: the identity links to the user, and membership is per org (already how KMS works).
- A user is removed from all mapped groups: keep their membership but downgrade them to `member`. **Never auto-delete users.**
- The org's admin revokes consent for the KMS Sign-in app: Microsoft sign-in fails visibly; super_admins can still use a password.
- A guest (B2B) account in NYPA's tenant has `#EXT#` in the UPN: use the `email` claim, not the UPN.

**Acceptance tests** (`scripts/ekp/a/a1-sso.*.test.mjs` + manual test-tenant checklist):

- [ ] A test-tenant user signs in with Microsoft (OIDC). A KMS user and `UserIdentity` are created, and they land in the right org.
- [ ] The same user signs in through SAML and lands on the same KMS user.
- [ ] An existing password user with the same email signs in with Microsoft and is linked, not duplicated.
- [ ] A user in a mapped Entra group gets the mapped role and departments. Removing them from the group downgrades them at the next login.
- [ ] A token from a tenant with no `OrgSsoConfig` is rejected with the "not set up" message; that user can still sign in with a password.
- [ ] A user whose Entra `email` is outside the org's verified domains is not linked to an existing KMS account with that email.
- [ ] Signing up with an email on an SSO domain goes to Microsoft; other emails sign up with a password as before.
- [ ] With `passwordLogin: "admins_only"`, a member can't use a password; a super_admin can.
- [ ] Every SSO login and every user creation is in the audit log.
- [ ] Password and OTP login still work for orgs without SSO (regression).

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
  - `resolvePrincipals(userId)`: `UserIdentity.externalId` (either `sso` or `email_match`, §3.1) + Graph `/users/{oid}/transitiveMemberOf` (app-only token), plus `tenant:<tid>`.
  - **This works without Microsoft sign-in**, so A2 doesn't wait for A1.
  - Cached for 15 minutes.
- **Scheduled sync:** register `sharepoint.sync` per org. The interval comes from the integration settings (default 60 min, NFR-6). "Sync Now" stays.
- **Graph permissions:** document exactly what NYPA's admin must grant: `Sites.Selected`, `User.Read.All`, `GroupMember.Read.All` (app-only), plus the delegated sign-in scopes. Verify in the test tenant.
- **Existing managed metadata (`A-23`, PRS E16.5):**
  - On each sync, read the item's list fields (Graph `/drives/{d}/items/{i}/listItem?$expand=fields`).
  - Store the managed-metadata (taxonomy) values as raw `{ field, label, termGuid }` on the document. Nothing is mapped to KMS terms yet; that's Workstream C (E15/E16).
  - At NYPA these are the Semaphore tags already applied to ~250,000 items (Q&A #128).
- **Large files (`A-24`):**
  - Files above a size limit (integration setting, default 200 MB) are recorded with their metadata, ACL and deep link, but they aren't downloaded or chunked. They're marked `skipped_too_large` in the sync run.
  - Until Phase 2 (E11), PPTX and MP4 produce no text anyway. The guard stops an 8 GB video (Q&A #188) from being loaded into worker memory.

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
- [ ] A password user whose verified email matches an Entra user sees exactly what that Entra user can see (`email_match`).
- [ ] A password user with no Entra match sees no ACL-restricted items.
- [ ] Disabling the Entra account removes the `email_match` identity at the next `acl-refresh`.
- [ ] Sync history shows each scheduled run. A 5,000-item sync completes without errors.
- [ ] The F1 parity test still passes for all non-SharePoint documents.
- [ ] A scheduled sync can be set to a 5-minute interval, and a 4-minute interval is rejected (`A-22`).
- [ ] A file with a managed-metadata value in the test tenant arrives with that value stored on the document (`A-23`).
- [ ] A file above the size limit appears in KMS with its deep link and permissions. It isn't downloaded, and the sync run reports it as skipped (`A-24`).

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

### A4: ServiceNow connector (stretch) · Content Server (after award) (E2.1, E2.8, E12.2)

**Status:** outlined. ServiceNow is a Phase 1 stretch for week 6; Content Server is deferred. Both are "target capability" in the RFP, not mandatory, and NYPA confirms both can be added after launch (Q&A #66).

**Scope for both:** read-only ingestion, the same pattern as SharePoint (`BaseConnector`). Content is indexed, searchable and citable, with a link back to the original. Nothing is written back to the source system.

**`ServiceNowConnector` (Phase 1 stretch):**

- **What it is:** ServiceNow is a cloud IT service management platform; its Knowledge Base module holds how-to and support articles.
- **What we ingest:** published Knowledge Base articles (Table API `kb_knowledge`), incremental by `sys_updated_on`, saved as `contentType: "article"`. **Knowledge Base only.** NYPA's scope is the KB (Q&A #126), so incidents and problems are out of scope.
- **Permissions:** each knowledge base is mapped to a KMS department in the integration settings, like SharePoint sites today. NYPA's main KB "is accessible to all users", and NYPA doesn't use script-based user criteria (Q&A #126). **Per-article user-criteria enforcement is dropped**, not deferred. If a later KB is restricted, map it to a narrower department.
- **Auth:** basic auth or OAuth client credentials for a read-only integration user, encrypted in `OrgIntegration` (`provider: "servicenow"`).
- **Test system:** free ServiceNow developer instance. NYPA runs the **"Australia"** release (Q&A #161), so pick a developer instance on that release (or the closest one available) and use only the stable Table API.

**Content Server (after award):**

- **What it is:** OpenText Content Server (formerly Livelink), an enterprise document management product, usually installed on the customer's own servers.
- **At NYPA (Q&A #17, #92, #114, #115, #161):**
  - Version and hosting: CE 25.4 in NYPA's private cloud, with **OpenText Extended ECM for M365** in use (Q&A #114, corrected in the 10/22 update). Extended ECM surfaces Content Server workspaces and documents in SharePoint and Teams. The design note should check whether that content is already reachable through the SharePoint connector, and avoid indexing it twice.
  - **A connector may be installed inside NYPA's network**, so an in-network sync agent that pushes to KMS is an accepted pattern.
  - Size: about 500K knowledge assets (not the 3 million records in the RFI), about 5 TB now and about 10 TB by year 3.
  - NYPA expects OCR and indexing of all images and video, though it says very few Content Server videos will need it.
- **Phase 1 deliverable:** a short design note only (REST API v2 nodes, categories metadata, per-node permissions → `DocumentAcl`, in-network agent option).
- **Blocked on:** an NYPA test instance, and how Content Server permissions are managed (AD groups, Content Server groups or both, which NYPA hasn't answered; Q&A #133). The version is now known.

**One ranked result list:** all sources already land in the same `Document` / `Chunk` index, so E2.1 only needs a source label and filter in the UI.

**Acceptance tests (ServiceNow):**

- [ ] A ServiceNow KB article from the developer instance is searchable and citable, with a link back to the original.
- [ ] An article in a knowledge base mapped to department X is visible only to users with access to department X.
- [ ] Results from SharePoint, ServiceNow and manual uploads appear in one list, labelled by source.

## 5. Dependencies with Workstream B

| A needs from B                                                   | When                                                           | B needs from A                                                                             | When                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| F2 `logAudit` with `entityType`/`entityId`                 | week 2 (A1 uses today's `logAudit` until then; not blocking) | F1 predicate in place, so soft delete, supersede and `in_review` are filtered everywhere | week 1–2                                  |
| F5 `getSetting` (`sharepoint.storeOriginals`, sync interval) | week 3                                                         | F3 scheduler and job registry                                                              | week 3 (B's stale/review jobs from week 5) |
| F4 `notify` (sync failure alerts to admins)                    | week 4 (optional)                                              | `Document` field names agreed (`externalUrl`, `contentType`)                         | review, week 1                             |

## 6. Task Tracker

> **For AI agents and the team:** this table is the source of truth for task status. When you start a task, set `Status` to `IN_PROGRESS` and fill in `Started`. When it's merged to `dev`, set `DONE` and fill in `Completed`. Update it in the same PR. Record important decisions made during implementation as a short note under §7. Design details for each task are in the package section named in its title (§4).

### Status legend

| Symbol          | Meaning                                   |
| --------------- | ----------------------------------------- |
| `TODO`        | Not started                               |
| `IN_PROGRESS` | Currently being worked on                 |
| `REVIEW`      | PR open, waiting for review               |
| `DONE`        | Complete and merged to `dev`            |
| `BLOCKED`     | Waiting on a dependency or external input |
| `SKIP`        | Deferred or out of scope                  |

Task IDs from the other workstream (e.g. `A-2` in B, `B-2` in A) are cross-workstream dependencies; see §5.

| Task ID  | Title                                                                                                                              | Status          | Assignee | Depends On                   | Started    | Completed  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- | ---------------------------- | ---------- | ---------- |
| `A-1`  | Finalize this document (shared design + A1)                                                                                        | `DONE`        | Johurul  | —                           | 2026-10-13 | 2026-10-15 |
| `A-2`  | A2 · F1: consolidate the access predicate into `src/lib/access/documentAccess.js` (no behaviour change) + parity test           | `REVIEW`      | Johurul  | `A-1`                      | 2026-10-15 |            |
| `A-3`  | A1 · Spike: register the KMS Sign-in app; sign in from the test tenant (redirect URIs, scopes, groups claim, `tid` → org)      | `DONE`        | Johurul  | `A-1`                      | 2026-10-16 | 2026-10-16 |
| `A-4`  | A1 · `UserIdentity` + `OrgSsoConfig` migration; one NextAuth config, remove `PrismaAdapter`                                 | `DONE`        | Johurul  | `A-3`                      | 2026-10-16 | 2026-10-16 |
| `A-5`  | A1 · Entra OIDC sign-in: SSO config API + admin page, `signIn` callback, JIT user, home realm discovery, `passwordLogin` rule | `DONE` | Johurul  | `A-4`                      | 2026-10-16 | 2026-10-19 |
| `A-6`  | A1 · Group → role/department mapping, including group overage                                                                    | `DONE`        | Johurul  | `A-5`                      | 2026-10-20 | 2026-10-21 |
| `A-7`  | A2 · F3: `ScheduledJob` migration, worker scheduler loop, job registry, admin page                                              | `DONE`        | Johurul  | `A-1`                      | 2026-10-21 | 2026-10-21 |
| `A-8`  | A2 · Spike: SharePoint site-group expansion + `deltashowsharingchanges` in the test tenant                                      | `DONE`        | Johurul  | `A-1`                      | 2026-10-21 | 2026-10-22 |
| `A-9`  | A2 · `DocumentAcl` migration + ACL capture in sync                                                                              | `IN_PROGRESS` | Johurul  | `A-2`, `A-8`             | 2026-10-23 |            |
| `A-10` | A2 · F1 ACL clause + `resolvePrincipals` (cached)                                                                               | `IN_PROGRESS` | Johurul  | `A-9`, `A-21`            | 2026-10-23 |            |
| `A-11` | A2 · Scheduled `sharepoint.sync`, permission-only re-sync, daily `acl-refresh`                                                | `IN_PROGRESS` | Johurul  | `A-7`, `A-9`            | 2026-10-23 |            |
| `A-12` | A2 · End-to-end permission tests + 5,000-item load test                                                                           | `TODO`        | Johurul  | `A-10`, `A-11`           |            |            |
| `A-13` | A3 · `externalUrl` + "Open in SharePoint" in the UI                                                                             | `IN_PROGRESS` | Johurul  | `A-9`                      | 2026-10-23 |            |
| `A-14` | A3 · No-copy mode + `getDocumentBytes` + preview endpoint                                                                       | `IN_PROGRESS` | Johurul  | `A-13`                   | 2026-10-23 |            |
| `A-15` | A3 · SharePoint site pages ingestion (`contentType: page`)                                                                      | `IN_PROGRESS` | Johurul  | `A-9`                      | 2026-10-23 |            |
| `A-16` | A1 · SAML 2.0 via embedded SAML Jackson + `BoxyHQSAMLProvider` (required by RFP §6 S2)                                         | `TODO`        | Johurul  | `A-5`                      |            |            |
| `A-17` | A4 · ServiceNow connector, KB articles only, knowledge base → department, no per-article criteria (stretch, developer instance) | `TODO`        | Johurul  | `A-9`                      |            |            |
| `A-18` | A4 · Content Server: design note in Phase 1; build after award (needs NYPA instance + network path)                               | `BLOCKED`     | Johurul  | NYPA                         |            |            |
| `A-19` | Phase 1 integration & cross-testing (A + B together, all roles)                                                                    | `TODO`        | All 3    | `A-12`, `A-15`, `B-21` |            |            |
| `A-20` | Update RTM status for E2, E12, E32 in the plan; re-score Phase 1                                                                   | `TODO`        | Johurul  | `A-19`                     |            |            |
| `A-21` | A2 · Identity by verified email (`email_match` via Graph app-only) + re-check in `acl-refresh`                                | `IN_PROGRESS` | Johurul  | `A-4`                      | 2026-10-23 |            |
| `A-22` | A2 · F3: lower the minimum job interval from 15 to 5 minutes (NFR-6, NYPA Q&A #99)                                                | `TODO`        | Johurul  | `A-7`                      |            |            |
| `A-23` | A2 · Store SharePoint managed-metadata values (raw label + term GUID) on synced documents (PRS E16.5; mapped to terms by C)       | `TODO`        | Johurul  | `A-9`                      |            |            |
| `A-24` | A2 · Large-file guard: above the size limit, index metadata, ACL and link only; no download (8 GB videos, Q&A #188)               | `TODO`        | Johurul  | `A-14`                     |            |            |

## 7. Implementation Notes

Add a dated note here when a task changes the design (e.g. `2026-10-20 · A-3: Sign-in app works in the test tenant`).

- `2026-10-15 · design review (Johurul):`
  - **Sign-in uses a multi-tenant KMS app** instead of a customer-registered app per org. Removes dynamic per-org providers and per-org secrets. Customer-registered apps become a fallback (AS-3).
  - **SAML 2.0 is required** (RFP §6 S2) and moves from week 6 to week 3. OIDC is still built first.
  - **Per-file permissions don't depend on SSO.** Users are mapped to Entra by verified email (`email_match`) until they sign in with Microsoft. New task `A-21`; `A-10` no longer depends on `A-6`.
  - **Content Server deferred to after award** (on-premises, no test instance, network path undecided). ServiceNow is a week-6 stretch, KB articles only.
  - `A-5` no longer blocks on `B-2`: A1 uses today's `logAudit` and switches to the F2 fields when they land.
- `2026-10-15 · Johurul:`
  - **Separate Sign-in app** from the SharePoint connector app (AS-3): the connector app is admin-only and holds data permissions; the Sign-in app is used by every user and holds sign-in scopes only.
  - **NYPA questions not sent.** Build on §2 assumptions; NYPA's design team reviews after award and we adjust then.
- `2026-10-15 · A-2 (F1 refactor):`
  - Moved every document-visibility rule into `src/lib/access/documentAccess.js`. Parity test `scripts/ekp/f1-access-parity.test.mjs` (`EKP_DB_TESTS=1 npm run ekp:f1:test`) compares each new function with a verbatim copy of the old code on a 270-document × 6-role seeded matrix (inside a rolled-back transaction) and on all existing org members. Both pass; a deliberate change makes it fail.
  - **The old copies don't agree with each other.** Preserved as-is (no behaviour change); decide before A-10:
    1. ~~**dept_admin sees every department's documents, including drafts,** on the repository page and document page (`isOrgAdmin`), but only their own departments in chat.~~ **Fixed 2026-10-16** (see below).
    2. **Archived documents** are visible to members on the repository and document pages but never in search, chat or the graph.
    3. **Timelines** check only the document's own department, not its project's department.
    4. **Knowledge graph / related documents:** super_admin sees every document (drafts, private); uploaders always see their own. Search doesn't do either.
    5. **Interactions:** the project owner can always record interactions on the project's documents.
- `2026-10-16 · A-2 follow-up (dept_admin fix):`
  - **Rule now:** super_admin sees every document. A dept_admin sees what a member sees, plus drafts in the departments they administer (`DepartmentMember.role = "admin"`), never other departments' drafts.
  - **Applied to:** repository listing and its search (it passed `isOrgAdmin` as `isSuperAdmin`), document page, timelines, and the classification and duplicate-review routes (new `canManageDocument`: uploader, super_admin, or admin of the document's department).
  - **Also fixed:** `?lifecycle=draft` on the repository listing let members list drafts; the draft rule now lives in `repositoryAccessWhere`, so filters only narrow.
  - The parity test checks dept_admin against the new rule (including "no drafts from a department they don't administer") and every other role against the old code.
- `2026-10-16 · A-4:`
  - **Two NextAuth configs existed** (the route handler had its own copy). The live handler lacked the `otp` provider, so the "existing email" one-time-code login couldn't work. Now one config in `src/lib/auth.js`; both adapter packages removed.
  - **SSO settings live in a new `OrgSsoConfig` table**, not `OrgIntegration` (which requires an access token and can't index `tenantId` inside JSON). `tenantId` is unique, enforcing one tenant ↔ one org.
  - **Spike result for A-3:** the installed `openid-client` 5.7.1 replaces `{tenantid}` in the multi-tenant issuer with the token's `tid`, so `AzureADProvider` with `tenantId: "organizations"` validates tokens from any tenant without a workaround.
- `2026-10-16 · A-3 / A-5 (part 1):`
  - **Done:** "Sign in with Microsoft" button (shown only when `ENTRA_SSO_CLIENT_ID` is set), `AzureADProvider` (`organizations`, photo download disabled so the JWT cookie stays small), and `resolveEntraSignIn` in `src/lib/sso/entra.js`: tenant must be connected, email must be on an allowed domain, user created or linked, joins as `employee` or with a pending invite's role and departments, `invite_only` honoured, `email_match` identities upgraded to `sso`, audit-logged. Tests: `scripts/ekp/a1-entra-signin.test.mjs` (10 cases, rolled-back transaction).
  - **Dev setup:** `scripts/ekp/connect-entra-tenant.mjs` connects a tenant until the admin page exists. The NGI test tenant is connected to org "NGI" (`cmsgu4ezz0000l404xf9nel8h`, domain `nextgenerationinnovation.onmicrosoft.com`).
  - **Remaining in A-5:** Settings → Single sign-on page with admin consent and verified-domain picker, email-first redirect, sign-up redirect for SSO domains, `passwordLogin` enforcement.
  - **Open:** B2B guests (contractors) whose email domain isn't the tenant's are refused for now (AS-7). Decide how to admit them safely in A-5.
- `2026-10-16 · A-3 verified:` `dev@nextgenerationinnovation.onmicrosoft.com` signed in with Microsoft on localhost. A KMS user was created (no password, email verified), the `sso` identity was linked to the NGI test tenant, the user joined org NGI as `employee`, and `auth.sso_user_created` was audit-logged.
- `2026-10-16 · A-5 (parts 2 and 3):`
  - **Admin page:** Settings → Integrations → *Microsoft sign-in* (`/org/[orgId]/integrations/microsoft-sso`). Connect = Microsoft `prompt=admin_consent` for the KMS Sign-in app, then Graph `/organization` gives the tenant id, name and verified domains (new columns `tenant_name`, `verified_domains`, migration `20261016010000_ekp_sso_verified_domains`). The callback completes only for the super admin who started it, within 10 minutes, and refuses a tenant connected to another org. Domains, who-can-join, password login, on/off and disconnect are audit-logged (`sso.connected` / `sso.updated` / `sso.disconnected`).
  - **Email-first:** the sign-in page checks the email's domain (`/api/auth/sso-discovery`) and switches to *Continue with Microsoft* (with `login_hint`); super admins can still choose their password.
  - **Sign-up** on a Microsoft sign-in domain goes to Microsoft (`/api/auth/register` returns 409 `useMicrosoft`).
  - **passwordLogin enforced** in both the password and one-time-code providers (`USE_MICROSOFT`); with `admins_only`, only the org's super admins keep a password.
  - **Requires** the redirect URI `<app URL>/api/integrations/entra-sso/callback` on the KMS Sign-in app (localhost and Vercel).
- `2026-10-19 · A-5 verified (Johurul, test tenant):` Connect Microsoft (admin consent → tenant sign-in) connected tenant "NGI" with its verified domain; disconnect and reconnect worked; `emp1@` (unlicensed test user) signed in with Microsoft and joined as `employee`. Audit: `sso.connected`, `sso.disconnected`, `auth.sso_user_created`, `auth.sso_login`. Test users in Entra need no license.
- `2026-10-20 · A-6 (group → role mapping):`
  - **Picker, not pasted ids:** the admin searches the tenant's security groups (`/api/org/[orgId]/sso/groups`, Graph `/groups` app-only) and maps each to a role and departments. Needs the **application** permission `GroupMember.Read.All` on the KMS Sign-in app (read-only groups and members; app-only so it works without the admin being signed in to Microsoft). Existing tenants approve it through **Reconnect**.
  - **Rules** (`src/lib/sso/groupMapping.js`): highest mapped role wins; departments unioned (admin beats member); a role the mapping set follows the mapping; a hand-set role is only ever raised, never lowered; memberships the mapping created are removed when the user leaves the group; hand-made memberships it raised to admin go back to member. What was granted is stored in `UserIdentity.groupGrants` (migration `20261020000000_ekp_identity_group_grants`). Changes are audit-logged (`auth.sso_group_mapping_applied`).
  - **Group overage** (more than 200 groups, no `groups` claim): each *mapped* group is checked with Graph `/groups/{id}/transitiveMembers?$filter=id eq '<oid>'` (works with `GroupMember.Read.All`; `/users/{id}/transitiveMemberOf` would need a user-read permission, verified 2026-10-21). If that fails, sign-in still succeeds and earlier grants are kept.
  - Tests: `scripts/ekp/a1-group-mapping.test.mjs` (pure rules + 9 sign-in scenarios, rolled-back transaction).
- `2026-10-21 · A-6 verified (test tenant):` mapped *KMS-Engineering* → Dept Admin + Engineering; `emp2@` signed in and became `dept_admin` and admin of Engineering. After removing emp2 from the group in Entra and signing in again, emp2 was back to `employee` with no departments; both changes audit-logged (`auth.sso_group_mapping_applied`).
- `2026-10-21 · A-7 (F3 scheduled jobs):`
  - **Table** `ScheduledJob` (migrations `20261021000000_ekp_scheduled_jobs`, `20261021000100_ekp_scheduled_job_run_now`). Uniqueness is a `key` column (`<name>:<orgId>` or `<name>:global`), not `@@unique([name, orgId])`: Postgres treats NULL orgIds as distinct, so global jobs could duplicate. `runRequestedAt` makes **Run now** work even when the job is off (one-off run). `SyncRun.trigger` = `manual` | `scheduled`, shown in the SharePoint sync history.
  - **Scheduler** `worker/scheduler.js`, started from `worker/index.js` next to the SQS loop: every 60 s one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` claims up to 5 due jobs and locks them for 30 min; passes never overlap; a crashed run is retried after its lock expires; `SCHEDULER_ENABLED=false` turns it off.
  - **Registry** `src/lib/jobs/registry.js` (relative imports only, loaded by worker and web app). **Workstream B adds jobs here** (label, description, default interval, `appliesTo`, `run`). Job rows are created lazily per org and **start off**.
  - **First job:** `sharepoint.sync`, which queues exactly what Sync Now queues, skipped while another run of the same integration is in flight (2 h).
  - **Admin:** Settings → *Scheduled Jobs* (super_admin): on/off, interval (15 min – 1 day), next/last run, status, error, Run now. Changes audit-logged (`jobs.updated`, `jobs.run_requested`).
  - Tests: `scripts/ekp/f3-scheduler.test.mjs` (`EKP_DB_TESTS=1 npm run ekp:f3:test`).
- `2026-10-21 · A-7 verified (local worker, NGI):` Run now at 06:36:45 was claimed by the scheduler 25 s later; it queued a SharePoint sync (`SyncRun.trigger = scheduled`) that completed in 7 s (0 new files). Job recorded `ok`, 3.3 s, lock released, next run one interval later; turning it on/off and changing the interval were audit-logged. After `prisma generate`, restart both `next dev` and the worker (the Prisma client is cached on `globalThis`).
- `2026-10-21 · A-8 spike, part 1 (read-only, NGI Engineering/Finance sites):`
  - **Works:** `GET /sites/{id}/drive/items/{id}/permissions` with the SharePoint app's app-only token (`Sites.Selected`). Entra/M365 group members and owners are readable via Graph.
  - **Files not shared explicitly carry inherited SharePoint site-group entries** (`grantedToV2.siteGroup`: Owners/Visitors/Members with ids `3/4/5`, unique **per site only**, so principal ids must be site-scoped), plus the M365 group's owners (`grantedToV2.group`, Entra id, `_o` login suffix).
  - **Site-group membership isn't available from Graph v1.0.** SharePoint REST (`/_api/web/sitegroups(n)/users`) rejects a client-secret app-only token (401); SharePoint app-only requires a **certificate** credential and SharePoint's own `Sites.Selected` (application) permission.
  - **Proposed (pending Johurul's decision):** add a certificate + SharePoint `Sites.Selected` to the SharePoint connector app and resolve site groups via REST (correct for communication sites and custom groups). Rejected alternative: mapping Owners/Members to the M365 group (team sites only; Visitors and communication sites unresolvable).
  - **Still to test:** files shared with one user, a security group, an org-wide link; sharing with unlicensed users; delta with `Prefer: deltashowsharingchanges`.
- `2026-10-22 · A-8 spike, final findings (NGI Engineering site, 4 test files):`
  - **Certificate decision (option A) done:** the SharePoint connector app has a certificate (`CN=KMS SharePoint Connector`, thumbprint `DB844F7C…D740D4`, expires 2028-10-20; key outside the repo, `SHAREPOINT_CERT_PATH` / `SHAREPOINT_CERT_KEY_PATH`) and SharePoint `Sites.Selected` (application). SharePoint REST with a certificate-signed client assertion works with the existing per-site grants: `/_api/web/sitegroups(n)/users` returns members. Deployed workers will need the PEMs as environment variables.
  - **Site-group members** (Engineering): *Members* = `c:0o.c|federateddirectoryclaimprovider|<M365 group id>` (that group's members); *Owners* = the same login with `_o` suffix (the M365 group's **owners**) + `SHAREPOINT\system`; *Visitors* = empty. Other login forms to handle: `i:0#.f|membership|<upn>` (user), `c:0t.c|tenant|<group id>` (security group), "Everyone" / `spo-grid-all-users` (whole tenant).
  - **What each sharing type looks like** in `GET /drives/…/items/{id}/permissions`:
    - specific user → direct `grantedToV2.user` (Entra object id);
    - security group → direct `grantedToV2.group` (Entra group id, login `c:0t.c|tenant|…`);
    - "People in <org>" link → direct entry with `link.scope = organization`;
    - not shared → inherited site-group entries + the M365 group owners (`grantedToV2.group` with `_o` login).
    - Sharing a file **breaks inheritance**: the site-group entries are copied onto the file as direct entries, so a file's permissions are always "site groups + extras".
    - Any role (`read`/`write`/`owner`) means the principal can see the file.
  - **No license needed:** sharing with unlicensed users (emp1, emp2) and a security group of unlicensed users worked without any warning.
  - **Permission-only changes are detectable:** delta with `Prefer: deltashowsharingchanges, hierarchicalsharing` marks items with `@microsoft.graph.sharedChanged = true` (no marker without the header).
  - **Design for A-9/A-10 (from these findings):**
    - Capture: for every synced file, read its permissions and store **expanded** rows in `DocumentAcl`. Site groups are resolved through SharePoint REST, cached per site per sync run, and stored as their members, so no `site_group` rows are needed at query time. Principal types: `user` (object id), `group` (Entra group id = its members), `group_owners` (Entra group id, `_o` logins), `tenant` (org links, "Everyone"). Users found only by UPN in site groups are resolved to object ids with Graph `/users/{upn}` (`User.Read.All` on the connector app). `SHAREPOINT\system` is ignored.
    - Enforcement (`resolvePrincipals`): the user's object id (from `UserIdentity`), their transitive group ids, the groups they own, and the tenant id.
    - Sync: request delta with the sharing header; when an item has `sharedChanged` but an unchanged `externalModifiedAt`, refresh its ACL without re-downloading it. (Today that path skips the file entirely.)
- `2026-10-23 · Johurul:` Batch the rest of Phase 1: build A-9, A-21, A-10, A-11, A-13, A-14 and A-15 one after another (a commit each, automated tests each), then **one combined test session and one PR** for the whole stretch.
- `2026-10-23 · A-9 (ACL capture):`
  - **Code:** `src/lib/connectors/sharepointAcl.js` (parse Graph permissions, expand site groups, `aclWriteData`), `src/lib/connectors/sharepointRest.js` (certificate token, `/_api/web/sitegroups(n)/users`). The worker reads a file's permissions **before** storing it (a file whose permissions can't be read is never ingested) and writes `DocumentAcl` rows in the same write as the document, with `aclSyncedAt`, `externalUrl` and `externalContainerId` (drive id).
  - **`aclSyncedAt` marks "permissions known".** A document with `aclSyncedAt` set and no matching row is visible to nobody but super admins; `aclSyncedAt = null` (manual uploads, or no certificate configured) keeps today's department rule.
  - **No certificate configured** (`SHAREPOINT_CERT_PEM`/`_KEY_PEM` or the `_PATH` variants): sync still works, ACLs aren't captured, and the worker logs a warning.
  - **Fixed on the way:** `getDelta` only read the first page of results (large libraries were cut off); it now follows `@odata.nextLink`. Graph calls retry on 429/503 with `Retry-After`.
  - ~~Migration `20261023000000_ekp_identity_groups_and_container`~~ dropped 2026-10-26, see below.
  - Tests: `scripts/ekp/a9-sharepoint-acl.test.mjs` (`npm run ekp:a9:test`), on the real permission entries of the Engineering test files. Dry run: `node scripts/ekp/sharepoint-acl-dryrun.mjs --org <orgId>` prints every file's rows (read-only); on NGI it matches the A-8 findings for all 4 test files.
- `2026-10-23 · A-21 (email_match) + group refresh for A-10:`
  - **Code:** `src/lib/identity/entraIdentity.js`. `syncEmailMatchIdentities` links org members to the Entra account whose UPN or mail equals their verified email (Graph `userPrincipalName in (…) or mail in (…)`, 7 emails per call): exactly one enabled match, `sso` always wins, one Entra account is never linked to two KMS users; a disabled or vanished account removes the link.
  - **Groups live on the identity** (`groupIds`, `ownedGroupIds`, `groupsSyncedAt`; `transitiveMemberOf` + `ownedObjects` with the connector app), so A-10's check is plain SQL with no Graph call per query.
  - **When it runs:** at every sign-in (NextAuth `events.signIn`, all providers) and in `resolveOrgRole` (the guard every org route uses): at most one DB check per user per minute, Graph only when groups are older than 15 minutes or the user has no identity yet (an unmatched user is retried hourly). Never blocks a request; groups that can't be refreshed for 24 hours are dropped (fails closed). The daily `acl-refresh` job (A-11) re-checks every member.
  - Tests: `scripts/ekp/a21-email-match.test.mjs` (`EKP_DB_TESTS=1 npm run ekp:a21:test`).
- `2026-10-23 · A-10 (enforcement):`
  - **Design change from §3.2:** no `resolvePrincipals(userId)` passed into each query. The user's identities and groups are stored on `UserIdentity` (A-21 note), and the clause in `src/lib/access/documentAcl.js` joins them in SQL: a document with `aclSyncedAt` set passes only if a `DocumentAcl` row matches the user's object id (`user`), tenant (`tenant`), a group they're in (`group`) or own (`group_owners`). So every existing and future F1 call site enforces it with no signature changes (search ×3, decisions, knowledge graph, related documents, relationships, recommendations, lessons evidence, topic snapshots); Prisma-`where` callers (chat workflow document, repository listing) pass `getUserPrincipals()` and fail closed without it.
  - **Also covered:** the JS checks (document page, interactions, decisions, timelines), expert discovery (`expertDiscoveryQuery.mjs`, both queries), and the dept_admin **management** paths (`documentManagementPolicy.js`, `canManageDocument`): asking a document or correcting its classification reads it, so a dept_admin also needs the file's SharePoint permission.
  - **Who skips it:** super_admin (as today, sees everything) and the uploader (for SharePoint files, the admin who connected SharePoint). A user with no Entra identity sees no ACL-restricted file. The tenant principal requires an identity in that tenant (the same object id in another tenant matches nothing).
  - Tests: `scripts/ekp/a10-acl-enforcement.test.mjs` (`EKP_DB_TESTS=1 npm run ekp:a10:test`): 8 users × 5 documents through every entry point.
- `2026-10-23 · A-11 (keeping permissions current):`
  - **Scheduled sync** is A-7's `sharepoint.sync` (interval set on the Scheduled Jobs page, not via B-4's settings, so **no longer depends on `B-4`**).
  - **Sharing changes:** delta asks for them; a flagged file only has its ACL re-read (A-9).
  - **Site-group membership changes** (someone added to *Visitors*) mark no file in delta. Every sync fingerprints the site's groups and members (`siteGroupFingerprint`, stored as `scopeConfig.sites[].aclFingerprint`); on a change it re-reads the whole site's ACLs. The first sync after this change has no fingerprint yet, so it also backfills files synced before A-9.
  - **Daily job `sharepoint.acl-refresh`** (starts off, 1 day, 3-hour lock via the new per-job `lockMinutes`): email match for every member, every identity's groups, then every synced file's ACL (unchanged ACLs only get `aclSyncedAt` bumped). Code: `src/lib/connectors/sharepointAclRefresh.js`.
  - Tests: `scripts/ekp/a11-acl-refresh.test.mjs` (`EKP_DB_TESTS=1 npm run ekp:a11:test`).
- `2026-10-23 · A-13 (deep links):` `externalUrl` is written by every sync and backfilled by the ACL refresh (A-11). "Open in SharePoint" (`src/components/documents/OpenInSourceLink.jsx`) appears on the document page, the repository cards (listing and search) and chat citations (the search SQL now returns `externalUrl`/`sourceProvider`).
- `2026-10-23 · A-14 (no-copy mode):`
  - **Setting lives in the integration** (`scopeConfig.storeOriginals`, `src/lib/connectors/sharepointSettings.js`), not B-4's org settings (still TODO), so **no longer depends on `B-4`**; it can move to F5 later. Toggle: SharePoint integration page → *Keep a copy of files in KMS* (audit `sharepoint.settings_updated`). **Absent = on** (today's behaviour), so existing integrations don't change until an admin turns it off. Re-confirming sites keeps the settings.
  - **Off:** the sync stores no S3 object and charges no storage (a copy kept from before is deleted and its size given back); the chunk job reads the bytes from SharePoint (`getDocumentBytes` in the worker: S3 if `filePath`, else Graph `/drives/{d}/items/{i}/content`), in memory only. Needs-Review confirm and Regenerate work without a stored copy.
  - **Preview/download:** `GET /api/documents/[id]/preview` streams from SharePoint after the document-page access check (including the file's SharePoint permissions); the document API returns it as `fileUrl`/`fileDownloadUrl`, so the existing PDF/DOCX viewers, repository Preview/Download and chat citations work unchanged.
  - Tests: `scripts/ekp/a14-no-copy.test.mjs` (`npm run ekp:a14:test`).
- `2026-10-23 · NYPA RFP Q&A (Johurul):` NYPA's answers to other vendors' questions are now in §2 (the "NYPA's answer" table) and in PRS v1.1 §6.
  - AS-1 and AS-7 are confirmed. GCC uses the standard endpoints, so nothing built changes.
  - ServiceNow (A4) is KB-only and open to all users, so **per-article user criteria are dropped**.
  - Content Server is in a private cloud, and an in-network connector is allowed.
  - New tasks: `A-22` (5-minute minimum interval), `A-23` (keep existing managed-metadata tags) and `A-24` (large-file guard).
  - Copilot/MCP access (E32.7) and PPTX/video extraction (E11, Phase 2) are out of Phase 1 scope (§1).
- `2026-10-24 · NYPA Q&A update (10/22, #213–#238):`
  - Content Server runs **Extended ECM for M365**, not OpenText Core (#114 corrected); see A4.
  - Go-live is SharePoint as it exists today, and nothing must be migrated (#234, #235). If EKB content is moved, its metadata must be kept (#234), which supports `A-23`.
  - Vendors must share performance statistics (#230). Keep the A-12 load-test results for the proposal.
- `2026-10-23 · A-15 (site pages):`
  - **A page is a drive item** in the site's *Site Pages* library, so it reuses A-9's permission capture, delta (own cursor, `scopeConfig.sites[].pagesCursor`) and A-11's refresh unchanged. Graph's `/lists` hides that library; its id comes from SharePoint REST (`BaseTemplate eq 119`), then Graph `/sites/{id}/lists/{listId}/drive` (falls back to the English title "Site Pages").
  - **Text** from Graph `sitePage` `canvasLayout` (text web parts, searchable texts of standard web parts, title, description), `src/lib/connectors/sharepointPages.js`. Stored in `Document.content` with `contentType: "page"`, no file; the chunk job uses that text. Pages with under 50 characters of text (e.g. an empty site home page) are skipped.
  - **Not readable with read-only access:** per-item role assignments over SharePoint REST need Full Control, which KMS doesn't ask for; Graph item permissions on the pages drive work and are what's used.
  - **Modern pages only.** Classic wiki pages aren't returned by Graph's pages API; skipped (after award, if NYPA has them).
  - Setting: *Include site pages* on the SharePoint integration page (`scopeConfig.syncPages`, absent = on). Pages show their text on the document page and have no Preview/Download (Open in SharePoint instead).
  - Tests: `scripts/ekp/a15-site-pages.test.mjs` (`npm run ekp:a15:test`). Live (read-only) on NGI Engineering: 3 pages found, text extracted, ACL = the site's Members/Owners groups.
- `2026-10-26 · Johurul: no new migration during Phase 1` (teammates are migrating too). Reworked so A-9…A-15 need **no schema change** (everything uses the columns already on `dev`):
  - **Groups aren't stored.** The user's transitive/owned group ids are read from Graph into an in-memory cache per server instance (`src/lib/identity/groupCache.js`), refreshed in `resolveOrgRole` when older than 15 minutes; the access SQL takes them as parameters and joins `UserIdentity` only for the object id and tenant. A cold cache (new server instance, Graph down) narrows access; entries not refreshed for 24 hours are dropped. Cost: one Graph call per user per server instance every 15 minutes.
  - **The user/tenant match is scoped to the document's tenant** (the SharePoint tenant connected to its org). Found by the A-10 test: an object id from another tenant matched before.
  - **No drive id column.** A document's site comes from its SharePoint URL (`externalUrl`, longest connected site URL at a path boundary), and the site's `driveId` / `pagesDriveId` are kept in `scopeConfig.sites` by every sync, else looked up from Graph (`src/lib/connectors/sharepointLocate.js`).
  - **All suites pass against the shared DB** (rolled-back transactions): F1 parity, F3, A-1, A-9, A-10, A-11, A-14, A-15, A-21, and the 5,000-document load test (A-12): 0.5–0.75 s per permission-checked query over the network to Neon.
  - If a migration becomes possible later (after Phase 1), moving groups to `UserIdentity` columns removes the per-instance Graph calls.
- `2026-10-26 · A-15 classic pages (Johurul: "can't we add them?"):`
  - **Classic wiki pages** (Site Pages, or any Wiki Page Library) and **publishing pages** ("Pages" libraries) are now ingested too. Text from the list fields (`WikiField` / `PublishingPageContent`, plus title and description), read with Graph `/drives/{d}/items/{i}/listItem?$expand=fields` (read access is enough).
  - **Several page libraries per site:** found through SharePoint REST (`BaseTemplate eq 119 or 850`), stored as `scopeConfig.sites[].pageLibraries` (`listId`, `driveId`, `template`, own delta `cursor`), looked up again each sync so a newly added library is picked up. Configs written by the first A-15 version (`pagesDriveId` / `pagesCursor`) are still read.
  - **A new classic page is invisible to KMS until it's checked in** (SharePoint shows a checked-out first version only to its author).
- `2026-10-26 · Phase 1 live test, bug found and fixed:` the first sync after A-9 failed on every site. Graph rejects a delta cursor created **without** `Prefer: deltashowsharingchanges` once the header is sent (410 *resyncRequired*); the same 410 happens when a cursor expires. `getDriveDelta` now restarts the listing from the beginning on a 410 (safe: unchanged items are recognised and skipped). Regression test in `a9-sharepoint-acl.test.mjs`.
- `2026-10-26 · Phase 1 live test, second fix:` SharePoint keeps system site groups with private membership ("Limited Access System Group For Web/List", "SharingLinks.…", "SharePointHome OrgLinks …"); listing their members returns 403, which made the site-group fingerprint fail on Engineering and the root site (so site-group changes there weren't detected). They grant nothing KMS reads through them (sharing links come from the item's own permissions), so the fingerprint now counts them by name only. Other errors still fail it.
- `2026-10-27 · Phase 2 finding (Johurul): chat refused a multi-keyword question` ("KESTREL OSPREY HERON PLOVER …, list me documents with these keywords") although emp1 can see two of them. Permissions were right; chat ranking and its answer rule weren't. Fixed (pre-existing chat behaviour, done in this branch at Johurul's request):
  - **Distinctive words keep a place** (`orgExactTermSearch` in `vectorSearch.js`, `pinExactMatches` in `hybridSearch.js`): words of the question (not stop words; ≥ 4 letters or a capital 3-letter acronym) that appear as whole words in 1–3 documents **the user can access** get their best chunk into the results, up to half the slots. Used by chat and `/api/org/[orgId]/search`.
  - **Partial answers:** the chat instructions now answer what the context supports and say which parts weren't found; the full refusal is only for nothing found.
  - **Fixed access sentence:** whenever something isn't found, the answer ends with "I only search documents you have access to." Never per keyword or based on hidden documents (that would let a user find out which hidden documents exist by guessing words).
  - **"Which documents mention X?"** (`isDocumentListingQuestion`): answered per word from exact matches over accessible documents (`src/lib/documentListing.js`), with those documents cited (up to 12).
  - **Suggested experts** must also be allowed to see the SharePoint document (`documentAclForUserColumnSql`; the expert query loads the candidates' groups, then re-runs with the check).
  - Tests: `scripts/ekp/chat-exact-terms.test.mjs` (`EKP_DB_TESTS=1 npm run ekp:chat:test`); expert case added to the A-10 test; the F1 real-data parity case now compares documents without SharePoint permissions (A-10 narrows the others on purpose). Checked live as emp1 with the real retrieval and model: the original question lists KESTREL and HERON and "no documents" for OSPREY and PLOVER; a mixed question answers the part it can.
- `2026-10-27 · chat follow-up (Johurul: "Are there any SharePoint pages with 'KMS Test Page'?"):`
  - **Source labels:** every document in the chat context and citations is labelled "SharePoint page", "SharePoint file" or "uploaded file" (`sourceLabel`), so chat can answer questions about pages and sources.
  - **Listing questions understand filters and phrases** (`parseListingQuestion`, `buildListing`, `orgListDocuments`): "SharePoint" plus "pages"/"files" filter instead of being searched for; double-quoted text is matched as a phrase in titles and text. "Which SharePoint pages do we have?" lists the SharePoint pages the user can open; `Are there any pages with "KMS Test Page"?` finds it by title. Also "are there / do we have … documents" questions.
  - **The access sentence is added by KMS, not the model:** the model added it even after full answers. It's now appended after the answer when a listing word or phrase had no matches, or the answer says something wasn't found (`needsAccessNote`).
- `2026-10-27 · Phase 2 (who sees what) passed, 36/36 checks:` emp1 (employee, direct shares), emp2 (dept_admin via group mapping, KMS-Engineering security group, direct share) and emp3 (employee, Engineering M365 group = site member), each run through the real code with their live Entra groups: repository listing, document page access, search and chat (real retrieval and model) for each test file's code word, Open-in-SharePoint links, and "Which SharePoint pages do we have?". emp1 sees 3 SharePoint items, emp2 3, emp3 the 14 Engineering items; no chat answer contained a fact from a file the user can't open. Department rules still apply on top (the onboarding checklist, filed under Finance in KMS, stays hidden from emp3). emp1 also checked by hand in the UI.
- `2026-10-27 · Phase 3 (permission changes) passed:` (1) emp1 removed from `only-emp1.docx` in SharePoint, Sync Now: emp1 lost it (KESTREL; checked by Johurul in the UI). (2) emp3 removed from the Engineering M365 group in Entra: with no sync, emp3's groups (read from Graph) no longer include it and emp3 now sees only `everyone-link.docx` (org-wide link) and no pages. (3) emp1 added to the Engineering Visitors site group, Sync Now: the site-group fingerprint changed, the whole site was re-read (`checked 15, updated 14, failed 0`) and emp1 now sees all 14 Engineering items (9 files, 5 pages), `only-emp1.docx` included, through Visitors only (Graph shows no direct share left on it). The two 410 "cursor no longer valid" lines in that sync are the expected restart (§7, Phase 1 finding). emp2 unchanged (3 items).
