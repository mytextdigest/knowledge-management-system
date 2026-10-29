# Integration Spec: ServiceNow Knowledge Base

| | |
|---|---|
| **Status** | Built and tested against a ServiceNow developer instance (`A-17`, 28 Oct 2026). |
| **Owner** | Johurul (Workstream A) |
| **Requirements** | PRS E2.1, E2.8, E12.2 ("target capability" in the RFP, not mandatory) |
| **Full design** | [WS_A_M365_CONNECTORS.md](WS_A_M365_CONNECTORS.md) §4 A4 · Test steps: [WS_A_TEST_MANUAL.md](WS_A_TEST_MANUAL.md) T9 |

## 1. Background: what you need to know first

**ServiceNow** is a cloud platform that large organizations use to run their **IT help desk** and other internal service desks (HR, facilities). When an employee reports "my laptop won't connect to VPN", that ticket usually lives in ServiceNow.

It has several modules. The one that matters to us:

| ServiceNow term | What it is |
|---|---|
| **Instance** | One company's own ServiceNow website, e.g. `nypa.service-now.com` |
| **Knowledge Base (KB)** | A collection of help articles, e.g. "IT Self-Help" or "Engineering Procedures". A company can have several. |
| **Knowledge article** | One how-to or troubleshooting page, numbered like `KB0010001`. Written by the help desk, reviewed, then **published**. |
| **Article states** | *Draft* → *Published* → *Retired*. Editing a published article creates a new version; the old one becomes *Outdated*. |
| **Incident / Problem** | Help-desk tickets. **Not** part of this integration. |
| **Table API** | ServiceNow's standard REST API for reading records. Articles live in the `kb_knowledge` table. |

Why help-desk articles matter: they're some of the most practical knowledge a company has ("how to request access to X", "what error Y means"), written and kept current by the people who answer those questions every day.

## 2. Why this matters to KMS

- **One place to ask.** Without this, an employee has to know whether the answer is in SharePoint, in ServiceNow, or in someone's head. With it, KMS chat answers from SharePoint files, ServiceNow articles and uploads together, citing each by source.
- **Fewer tickets.** If chat can answer "what does error MTD-ERR-4012 mean?" from a KB article, nobody needs to open a ticket.
- **No duplication.** The help desk keeps writing in ServiceNow, as today. KMS picks up new and edited articles automatically.
- **For NYPA:** the RFP lists ServiceNow as a source to integrate. NYPA confirmed the scope is **Knowledge Base only**, their main KB is open to all users, and they run the "Australia" release (Q&A #126, #161). It's a "target capability", so having it working is a differentiator rather than a box we must tick.

## 3. How it works

```
 ServiceNow instance                              KMS
 ┌────────────────────────────┐  read published  ┌───────────────────────────────┐
 │ Knowledge Base "IT Help"   │  articles changed │ Background worker             │
 │  KB0010001 How to reset…   │ ────────────────▶ │  • article text → search/chat │
 │  KB0010002 VPN error 809…  │  since last sync  │  • assigned to a department   │
 └────────────────────────────┘                   │  • link back to the article   │
                                                  └───────────────────────────────┘
```

1. **Connect (once).** A KMS super admin enters the instance address and the credentials of a **read-only integration user** that the customer's ServiceNow admin creates. KMS supports OAuth client credentials (recommended; some instances block basic auth) or username/password. Credentials are stored encrypted, per org.
2. **Map.** KMS lists the instance's knowledge bases. The admin maps each one to a KMS department, e.g. *Engineering Procedures → Engineering*. Unmapped knowledge bases are ignored.
3. **Sync.** On **Sync Now** or on a schedule, KMS reads only the published articles changed since the last sync.
4. **Review.** New articles wait in **Needs Review** (filterable by *ServiceNow*) until an admin approves them.
5. **Use.** Approved articles show in the repository with a **ServiceNow article** badge and **Open in ServiceNow**, and are searchable and citable in chat.

**Who can see an article:** whoever can see the KMS department its knowledge base is mapped to. Remap the KB to another department and access follows on the next sync. (This is simpler than SharePoint's per-file permissions on purpose: NYPA's KB is open to everyone, so per-article rules aren't needed. A restricted KB can be mapped to a narrower department.)

**Keeping current:**

- An edited article (a new version in ServiceNow) comes in as a new draft for review; the old version is retired in KMS.
- An article retired in ServiceNow is retired in KMS on the next sync.
- Disconnecting stops syncing but keeps already-approved articles.

## 4. What we built

| Feature | Notes |
|---|---|
| Connect form with **Test and connect** | Shows "Connected to … as …" and the list of knowledge bases |
| OAuth client credentials or basic auth | Optional OAuth scope so the customer can limit KMS to the Table API |
| Knowledge base → department mapping | Remapping moves the articles on the next sync |
| Incremental sync (Sync Now + scheduled) | Only articles changed since the last run |
| Needs Review, source badge, "Open in ServiceNow" | Same flow as SharePoint |
| Chat and search | Articles answer questions alongside SharePoint and uploads, labelled by source |

**Proven on our developer instance (28 Oct 2026):** 8 articles synced and approved; chat answered three test questions citing the right articles; remapping the KB to Finance hid the articles from an Engineering user, and mapping it back restored them.

## 5. What it doesn't do

- **Read-only.** KMS never creates, edits or retires anything in ServiceNow.
- **Knowledge Base articles only.** No incidents, problems, requests or catalog items.
- **No per-article permissions** (ServiceNow "user criteria"). Access is per knowledge base, through the department mapping. Dropped because NYPA doesn't use them.
- **Standard ServiceNow addresses only** (`*.service-now.com`, `*.servicenowservices.com`). A custom domain needs a security decision first.
- **Attachments on articles** aren't ingested; only the article text.

## 6. Where things are

| What | Where |
|---|---|
| API client | `src/lib/connectors/servicenowApi.js` (read-only Table API) |
| Connector, sync, settings | `src/lib/connectors/servicenow.js`, `servicenowSync.js`, `servicenowSettings.js` |
| Admin page | `src/app/(app)/org/[orgId]/integrations/servicenow/page.jsx`, API `api/org/[orgId]/integrations/servicenow/*` |
| Schedules | Org Settings → Scheduled Jobs (`servicenow.sync`, off by default) |
| Data | Existing `OrgIntegration` row (`provider: "servicenow"`); articles are `Document` rows with `contentType: "article"`. No new tables. |
| Tests | `EKP_DB_TESTS=1 npm run ekp:a17:test` |
| Try it | Developer instance `https://dev424186.service-now.com`, KB **Engineering Procedures** (8 articles). It sleeps when idle: wake it from developer.servicenow.com. Credentials from the tech lead. |

## 7. Glossary

| Term | Meaning |
|---|---|
| ServiceNow | Cloud platform for IT and other service desks |
| Instance | A company's own ServiceNow site |
| Knowledge Base (KB) | A set of help articles in ServiceNow |
| Knowledge article | One help article, numbered `KB00…` |
| Table API | ServiceNow's REST API for reading records |
| OAuth client credentials | Signing in as an app with an id and secret instead of a user's password |
| Integration user | A ServiceNow account made just for KMS, with read-only access |
| User criteria | ServiceNow's per-article "who can read this" rules (not used by KMS) |
