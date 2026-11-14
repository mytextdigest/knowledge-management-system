# Integration Spec: SharePoint

| | |
|---|---|
| **Status** | Built and tested (sync, per-file permissions, pages, deep links, no-copy mode, large-file guard). Keeping existing SharePoint tags still to do (`A-23`). |
| **Owner** | Johurul (Workstream A) |
| **Requirements** | PRS E2.2–E2.7, E12.1, E12.3–E12.4, E32.2–E32.5 |
| **Full design** | [WS_A_M365_CONNECTORS.md](WS_A_M365_CONNECTORS.md) §4 A2–A3 · Test steps: [WS_A_TEST_MANUAL.md](WS_A_TEST_MANUAL.md) T3–T8 |

## 1. Background: what you need to know first

**SharePoint** is Microsoft's file and intranet system, part of Microsoft 365. Think of it as a company-wide shared drive with web pages on top. Most large organizations keep their official documents there.

How it's organized:

| SharePoint term | What it is | Rough analogy |
|---|---|---|
| **Site** | A space for a team or topic, e.g. "Engineering" or "HR Policies" | A shared folder with its own homepage |
| **Document library** | The file area inside a site (usually called "Documents") | The folder itself |
| **File** | Word, PDF, Excel, PowerPoint, video… | A file |
| **Page** | A web page written inside SharePoint (news, how-tos, wiki articles). Not a file. | An intranet article |
| **Permissions** | Who can open what. Set per site, and can be changed per file ("Share with…") | Folder/file sharing settings |

**Who can open a file** is decided in a few ways, and they combine:

- **Site groups:** each site has *Owners*, *Members* and *Visitors*. By default everything in the site is open to those three groups.
- **Direct sharing:** someone clicks "Share" on one file and adds a person or a group.
- **Links:** "People in your organization with the link can view".
- **Microsoft groups** (from Entra ID, see [Microsoft sign-in](INTEGRATION_MICROSOFT_SIGNIN.md)) can be used anywhere a person can.

So two employees in the same team can see different files on the same site. That's the hard part of this integration.

**Microsoft Graph** is the API Microsoft provides to read SharePoint (and the rest of M365). KMS uses it to list files, download them, and read their permissions.

## 2. Why this matters to KMS

KMS is only useful if it can answer questions from the company's real knowledge, and at most customers that knowledge **already lives in SharePoint**. Asking people to re-upload everything into KMS doesn't work: copies go stale, and nobody maintains two places.

For NYPA: about 1,500 in-scope files across their Enterprise Knowledge Base site and 7 other sites (mostly PDF, PowerPoint and video), and they've said **content stays in SharePoint, nothing gets migrated**.

The integration has to promise three things:

1. **KMS stays in sync.** A file edited or deleted in SharePoint is updated or removed in KMS automatically.
2. **KMS never leaks.** If you can't open a file in SharePoint, KMS never shows it to you: not in the list, not in search, and **not inside a chat answer**. This is the requirement security teams care about most.
3. **SharePoint stays the master copy.** KMS links back to the original, and can avoid storing a second copy of the file at all.

## 3. How it works

```
 SharePoint (customer's M365)                 KMS
 ┌─────────────────────────┐   1. list changes   ┌──────────────────────────────┐
 │ Sites → files + pages   │ ──────────────────▶ │ Background worker            │
 │ Permissions per file    │   2. download file  │  • extract text, split, embed│
 │ Groups (Entra ID)       │   3. read who can   │  • save who-can-open list    │
 └─────────────────────────┘      open it        │  • save link back to file    │
                                                 └──────────────┬───────────────┘
                                                                ▼
                                   User searches / asks chat ──▶ KMS filters every result
                                                                 by "can this person open it
                                                                 in SharePoint?" before showing it
```

**Step by step:**

1. **Connect (once).** A KMS super admin clicks **Connect SharePoint**, signs in with Microsoft, and **picks which sites** KMS may read. Each site is mapped to a KMS department. KMS gets read access to those sites only, not the whole company (Microsoft calls this `Sites.Selected`).
2. **Sync.** On **Sync Now** or on a schedule (as often as every 5 minutes), the worker asks SharePoint "what changed since last time?" and only processes new, edited, deleted or re-shared items.
3. **Process.** For each file: download it, extract its text (PDF incl. scanned/OCR, Word, Excel, text), split it into chunks for search and chat, and save the list of people/groups allowed to open it.
4. **Review.** New items wait in **Needs Review** until an admin approves them, like manual uploads.
5. **Enforce.** Every search, chat answer, repository listing, document page, recommendation and expert suggestion checks the user against that saved list. A user is matched to SharePoint by their Microsoft account (or, if they signed in with a password, by their verified email matching a Microsoft account).
6. **Keep current.** Sharing changes are picked up on the next sync. Group membership changes are picked up within 15 minutes. An optional daily job re-checks every file's permissions as a safety net.

## 4. What we built

| Feature | What it means for users |
|---|---|
| **Site sync** (scheduled + Sync Now) | SharePoint content shows up in KMS without uploading |
| **Per-file permissions** | Each person sees exactly what they could open in SharePoint, everywhere in KMS, including chat |
| **Department rules still apply on top** | A file filed under Finance in KMS stays hidden from Engineering, even if SharePoint would allow it |
| **Dept admins don't bypass SharePoint** | Being a KMS admin of a department doesn't reveal SharePoint files you can't open (super admins are the exception) |
| **SharePoint pages** | Modern pages, classic wiki pages and publishing pages are searchable and citable, not just files |
| **"Open in SharePoint"** | On repository cards, document pages and chat citations |
| **No-copy mode** | Turn off *Keep a copy of files in KMS*: KMS keeps only the extracted text for search; Preview and Download fetch the file live from SharePoint |
| **Large-file guard** | Files above a size limit (default 200 MB, e.g. NYPA's videos up to 8 GB) are listed with their link and permissions but not downloaded |
| **Sync history** | Each run shows what was added, updated, skipped or failed |

**Proven in our test tenant (27 Oct 2026):** three test users with different sharing set-ups each saw exactly their expected items across repository, search and chat; removing access in SharePoint removed it in KMS; no chat answer ever contained a fact from a file the user couldn't open. 5,000-document load test passed.

## 5. What it doesn't do

- **Read-only.** KMS never edits, moves, deletes or re-shares anything in SharePoint.
- **SharePoint Online only**, not on-premises SharePoint servers (NYPA confirmed Online).
- **PowerPoint and video text** isn't extracted yet (Phase 2). They're synced with name, link and permissions but aren't searchable by content.
- **Existing SharePoint tags** (managed metadata, e.g. NYPA's ~250,000 Semaphore tags) aren't kept yet (`A-23`).
- **OneDrive** (personal files, meeting recordings) isn't in scope; only the sites the admin picks.
- **A page that's checked out** in SharePoint is invisible to KMS until it's checked in.

## 6. Where things are

| What | Where |
|---|---|
| Connector (Graph calls, sync) | `src/lib/msGraph.js`, `src/lib/connectors/sharepoint.js`, `worker/index.js` |
| Permissions: reading | `src/lib/connectors/sharepointAcl.js`, `sharepointRest.js`, `sharepointAclRefresh.js` |
| Permissions: enforcing | `src/lib/access/documentAccess.js`, `src/lib/access/documentAcl.js`, `src/lib/identity/` |
| Pages, no-copy, large files | `sharepointPages.js`, `sharepointSettings.js`, `sharepointLargeFiles.js`, `api/documents/[id]/preview` |
| Admin page | `src/app/(app)/org/[orgId]/integrations/sharepoint/page.jsx` |
| Schedules | Org Settings → Scheduled Jobs (`sharepoint.sync`, `sharepoint.acl-refresh`), `src/lib/jobs/registry.js` |
| Config | `MSGRAPH_CLIENT_ID`, `MSGRAPH_CLIENT_SECRET`, `SHAREPOINT_CERT_*` (ask the tech lead) |
| Tests | `npm run ekp:a9:test` … `ekp:a24:test` (list in the test manual §7) |
| Try it | Test org **NGI**, sites **Engineering** and **Finance** in `nextgenerationinnovation.onmicrosoft.com` |

## 7. Glossary

| Term | Meaning |
|---|---|
| Site / library / page | See the table in §1 |
| Microsoft Graph | Microsoft's API for reading M365 data |
| `Sites.Selected` | A Microsoft permission that lets an app read only the sites an admin explicitly grants |
| Delta | "Give me only what changed since last time"; keeps a 5-minute sync cheap |
| ACL | Access control list: the list of people/groups allowed to open an item |
| No-copy mode | KMS stores extracted text but not the file itself |
| Deep link | The "Open in SharePoint" URL to the original |
