# Microsoft, SharePoint & ServiceNow in KMS: Test and Demo Manual

**For:** alpha testers and anyone giving a demo. No coding needed.
**Covers:** Microsoft sign-in, SharePoint sync, SharePoint permissions in KMS, SharePoint pages, "Open in SharePoint", no-copy mode, the scheduled permission refresh, and ServiceNow Knowledge Base articles (T9).
**Last full pass:** 27 Oct 2026 (T1–T8) and 28 Oct 2026 (T9), all tests passed (record: [WS_A_M365_CONNECTORS.md](WS_A_M365_CONNECTORS.md) §7).

---

## 1. The idea in one paragraph

KMS reads documents from SharePoint, but **never shows anyone a document they can't open in SharePoint**. That rule applies everywhere: the repository, search, chat answers and suggested experts. When permissions change in SharePoint or in Microsoft groups, KMS follows. KMS only **reads** from SharePoint; it never changes anything there.

On top of SharePoint's rule, KMS's own department rules still apply. A file filed under Finance in KMS stays hidden from someone who is only in Engineering, even if SharePoint would let them open it.

---

## 2. What you need

| What | Details |
|---|---|
| KMS org | **NGI** (admin: `nexgeninnovation2018@gmail.com`, super admin) |
| Microsoft test tenant | `nextgenerationinnovation.onmicrosoft.com` |
| SharePoint sites | **Engineering** (main test site) and **Finance** |
| Test users | `emp1@…`, `emp2@…`, `emp3@nextgenerationinnovation.onmicrosoft.com` (ask the tech lead for passwords; never post them in chat) |
| Browser | One Chrome profile or Incognito window **per user**. Microsoft remembers the last account, so mixing users in one window signs you in as the wrong person. |

Admin pages used in this manual:

- **SharePoint integration:** Org Settings → Integrations → SharePoint (**Sync Now**, *Keep a copy of files in KMS*, *Include site pages*).
- **Needs Review:** left menu. New SharePoint items wait here until approved.
- **Scheduled Jobs:** Org Settings → Scheduled Jobs.
- **Microsoft sign-in:** Org Settings → Integrations → Microsoft sign-in (email domains, roles from Microsoft groups).
- **ServiceNow:** Org Settings → Integrations → ServiceNow Knowledge Base (connect, knowledge base → department, **Sync Now**). Test instance `https://dev424186.service-now.com`, knowledge base **Engineering Procedures** (8 articles, KB0010001–KB0010008). It sleeps when idle: wake it from developer.servicenow.com first.

---

## 3. The test world

### 3.1 People

| User | KMS role | Microsoft groups | Why they're interesting |
|---|---|---|---|
| **emp1** | employee, member of Engineering | none relevant | Sees only what's shared with them personally |
| **emp2** | **dept admin** of Engineering (given automatically by the *KMS-Engineering* group mapping) | KMS-Engineering (security group) | Proves a dept admin does **not** bypass SharePoint permissions |
| **emp3** | employee, member of Engineering | **Engineering** (Microsoft 365 group = Engineering site members) | Sees the whole Engineering site, like a normal team member |

### 3.2 Test files and pages (Engineering site)

Each test file has a **code word**. Searching for it is the quickest way to tell whether someone can see that file. The **secret fact** is only in that file. If chat ever says it to someone who can't open the file, that's a leak.

| Item | How it's shared in SharePoint | Code word | Secret fact |
|---|---|---|---|
| `only-emp1.docx` | Site default **+ shared directly with emp1** | KESTREL | "first 30 days" onboarding plan |
| `engineering-group.docx` | Site default **+ shared with the KMS-Engineering group** | OSPREY | release checklist steps |
| `everyone-link.docx` | Site default **+ "People in your organization" link** | HERON | winter break from **December 24** |
| `site-default.docx` | Site default **+ shared directly with emp2** | PLOVER | **two-week sprints** |
| **KMS Test Page** (modern page) | Site default **+ shared with emp1** | — | — |
| **KMS Classic Wiki Test** (classic wiki page) | Site default | — | — |
| **This is a test page for testing**, **Document Intelligence Platform**, **Home** (pages) | Site default | — | — |
| 6 older Engineering files (Runbook, Code Review Guidelines, KMS PRD, KMS_Overview, misc-update-notes, nocopy-test) | Site default | — | — |

"Site default" means the Engineering site's Owners, Members and Visitors can open it.

### 3.3 Who should see what (the baseline)

| Item | emp1 | emp2 | emp3 |
|---|:-:|:-:|:-:|
| `only-emp1.docx` (KESTREL) | ✅ | ❌ | ✅ |
| `engineering-group.docx` (OSPREY) | ❌ | ✅ | ✅ |
| `everyone-link.docx` (HERON) | ✅ | ✅ | ✅ |
| `site-default.docx` (PLOVER) | ❌ | ✅ | ✅ |
| KMS Test Page | ✅ | ❌ | ✅ |
| Other Engineering pages and files | ❌ | ❌ | ✅ |
| Any Finance file or page | ❌ | ❌ | ❌ |
| `engineering-onboarding-checklist.pdf` (filed under **Finance** in KMS) | ❌ | ❌ | ❌ |
| **Total SharePoint items** | **3** | **3** | **15** |

Super admins see everything; that's expected.

> **Before you start, check the baseline.** The last test run left two changes in place: emp1 is no longer shared on `only-emp1.docx`, and emp3 is out of the Engineering Microsoft 365 group. To restore the baseline: share `only-emp1.docx` with emp1 again (SharePoint → the file → ⋯ → **Manage access**), add emp3 back to the **Engineering** group (Entra admin center → Groups → Engineering → Members → Add), then **Sync Now** in KMS and have emp3 sign out and back in.

---

## 4. Tests

Each test lists the steps, what you should see, and what it proves. Mark ✅ or ❌, and for any ❌ note the user, the item and a screenshot.

### T1. Sign in with Microsoft

1. In a fresh Incognito window, open KMS and click **Sign in with Microsoft**. Sign in as **emp3**.
2. **Expect:** you land in the NGI org without being asked to create an account. Your name appears bottom left.
3. Sign out. On the sign-in page, type `emp1@nextgenerationinnovation.onmicrosoft.com` in the email box.
4. **Expect:** KMS sends you straight to Microsoft instead of asking for a KMS password, because the domain belongs to NGI's Microsoft tenant.

*Proves:* employees use their normal Microsoft work account and its MFA; no separate KMS password.

### T2. Roles from Microsoft groups

1. Sign in as **emp2**. Open **Engineering** in the left menu.
2. **Expect:** emp2 has dept admin controls for Engineering (for example, managing department documents), with no manual role change in KMS.

*Proves:* an admin maps Microsoft groups to KMS roles once (Microsoft sign-in page → *Roles from Microsoft groups*), and roles follow group membership at each sign-in.

### T3. First sync

1. As the admin, open the **SharePoint integration** page and click **Sync Now**.
2. Open **Needs Review** and approve the new items.
3. **Expect:** the files and pages appear in the **Knowledge Repository**. Pages show the label **SharePoint page**.

*Proves:* KMS pulls in SharePoint files, modern pages and classic wiki pages, together with their permissions.

> A page that is **checked out** in SharePoint isn't visible to KMS until it's checked in. Files with almost no text (under about 50 characters) aren't indexed.

### T4. Who sees what (the core test)

Do this for **emp1, emp2 and emp3**, each in their own window. Compare with the table in §3.3.

1. **Repository:** open **Knowledge Repository** and check which SharePoint items are listed (they have an **Open in SharePoint** button).
2. **Search:** search each code word: KESTREL, OSPREY, HERON, PLOVER.
   **Expect:** results only for the files that user can see.
3. **Chat:** in **Org Chat**, ask:
   - "What is the KESTREL onboarding plan?"
   - "When does the HERON winter break start?"
   - "How long are sprints in the PLOVER charter?"
   - "Which documents mention KESTREL, OSPREY, HERON and PLOVER?"

   **Expect:** a real answer with a citation for files the user can see. For files they can't see, a "no documents found" style answer ending with **"I only search documents you have access to."** The **secret fact** never appears.
4. **Pages:** ask chat "Which SharePoint pages do we have?"
   **Expect:** emp1 gets 1 page (KMS Test Page), emp2 gets none, emp3 gets 5.
5. **Direct link:** as emp3, open a file and copy the URL from the address bar. Paste it into emp1's window for a file emp1 can't see.
   **Expect:** emp1 can't open it.

*Proves:* SharePoint permissions are enforced everywhere in KMS, including chat, and for dept admins too.

### T5. Open in SharePoint

1. As any user, find a visible SharePoint item.
2. **Expect:** an **Open in SharePoint** button on the repository card, on the document page, and in the citation pop-up in chat (which also shows *Source: SharePoint file* or *SharePoint page*).
3. Click it. **Expect:** the item opens in SharePoint.
4. On a **page**, the document page shows the page's text and has no Preview or Download buttons; that's expected.

*Proves:* SharePoint stays the master copy; KMS links back to it.

### T6. Permission changes are followed

Do these one at a time and check after each.

| # | Change (in SharePoint or Entra) | Then | Expect |
|---|---|---|---|
| a | Remove **emp1** from `only-emp1.docx` (⋯ → **Manage access**) | **Sync Now** | emp1 no longer finds KESTREL |
| b | Remove **emp3** from the **Engineering** Microsoft 365 group (Entra) | emp3 signs out and back in, or waits **15 minutes**. No sync needed. | emp3 sees only `everyone-link.docx` |
| c | Add **emp1** to the **Engineering Visitors** group (Site settings → Site permissions → Advanced permission settings → Engineering Visitors → New → Add users) | **Sync Now** | emp1 sees every Engineering item |

*Proves:* KMS follows sharing changes, group membership changes and SharePoint site-group changes. For (c), the worker log shows `Site permissions re-read … updated N`.

### T7. No-copy mode (SharePoint as the only copy)

1. On the SharePoint integration page, turn **off** *Keep a copy of files in KMS*.
2. Upload a new Word file with a few sentences to the Engineering site. Click **Sync Now** and approve it in **Needs Review**.
3. Open it in KMS. **Expect:** the preview shows the document, and **Download** gives you the original file.
4. Search for a word from it, or ask chat about it. **Expect:** it's found and cited.

*Proves:* the organization can keep its files only in SharePoint. KMS stores the extracted text for search and chat, but not the file itself; Preview and Download fetch it live from SharePoint, with the user's current permissions. (A tech lead can confirm in the database that no file copy was stored.)

Turn the setting back on afterwards if the next tester expects it on.

### T8. Daily permission refresh

1. Make a change without syncing, for example remove emp1 from **Engineering Visitors**.
2. Go to **Org Settings → Scheduled Jobs → SharePoint permissions refresh** and click **Run now**.
3. **Expect:** within about a minute the job shows **ok**, and the change has taken effect (emp1 is back to 3 items).

*Proves:* even without anyone clicking Sync Now, a daily job re-checks every file's permissions, so nothing stays visible after access is removed. The job is off by default; an admin can turn it on.

### T9. ServiceNow Knowledge Base articles

Done by the KMS admin, then emp1 (who is in Engineering).

1. **Connect:** ServiceNow Knowledge Base page → instance address, **OAuth client credentials**, Client ID and secret (from the tech lead) → **Test and connect**. **Expect:** "Connected to … as …" and a list of the instance's knowledge bases.
2. **Map and sync:** set **Engineering Procedures → Engineering**, **Save**, **Sync Now**. **Expect:** the run shows *8 articles synced* (0 if they were synced before and nothing changed in ServiceNow).
3. **Review:** in **Needs Review**, filter on **ServiceNow** and approve the articles.
4. **As emp1:** the repository shows them with a **ServiceNow article** badge and an **Open in ServiceNow** button that opens the article on the instance. Ask chat:
   - "How many documents can a project hold?" → **200**, citing *Using Project Chat…*
   - "What does MTD-ERR-4012 mean?" → cites *Troubleshooting: Document Stuck in "Processing"…*
   - "How long are generated slides kept?" → **30 days**, citing *Generating Presentation Slides…*
5. **Department rule:** as admin, change the mapping to **Engineering Procedures → Finance**, **Save**, **Sync Now**. **Expect:** emp1 no longer sees the articles and chat can't answer the questions above. Map it back to **Engineering** and **Sync Now**: they're back, no re-approval needed.

*Proves:* ServiceNow articles are searchable and citable next to SharePoint files and uploads, each labelled by source; access follows the department the knowledge base is mapped to. KMS only reads from ServiceNow. Disconnecting stops syncing but keeps approved articles; an article retired in ServiceNow is retired in KMS on the next sync.

---

## 5. Ten-minute demo script

Use emp1 and emp3 side by side in two windows.

1. **Sign in (1 min):** sign in as emp3 with Microsoft. "No new password; it's their work account with MFA."
2. **Same question, two people (3 min):** in both windows ask chat "What is the KESTREL onboarding plan?" and "Which documents mention OSPREY?". emp3 gets answers with citations; emp1 gets KESTREL but "no documents" for OSPREY. "KMS knows exactly what each person may see in SharePoint."
3. **Open in SharePoint (1 min):** click a citation → **Open in SharePoint**. "SharePoint stays the master copy."
4. **Pages (1 min):** ask "Which SharePoint pages do we have?" in both windows. Different answers.
5. **Live permission change (3 min):** in SharePoint, add emp1 to Engineering Visitors, then **Sync Now**. Ask emp1's question again: now it's answered. Remove emp1 again afterwards.
6. **No-copy (1 min):** show the *Keep a copy of files in KMS* switch. "If you don't want files duplicated, KMS reads them from SharePoint on demand."
7. **ServiceNow (3 min, optional):** show the ServiceNow page (connected, Engineering Procedures → Engineering), then **Needs Review** with the 8 articles and approve them. As emp1 ask "What does MTD-ERR-4012 mean?" and click **Open in ServiceNow**. "Knowledge articles from ServiceNow and files from SharePoint answer in the same chat, with the same department rules." Approving works once; Sync Now shows 0 unless an article was edited in ServiceNow.

Talking points: KMS only reads from SharePoint, never writes. Permissions apply to chat answers too, not just lists. Dept admins don't get around SharePoint permissions.

---

## 6. Troubleshooting

| You see | Why | What to do |
|---|---|---|
| Signed in as the wrong Microsoft user | The browser remembered another account | Use a separate Chrome profile or Incognito per user |
| A group change hasn't taken effect | KMS re-reads a user's groups every 15 minutes or at sign-in | Sign out and back in |
| A new SharePoint item isn't in the repository | It's waiting in **Needs Review**, or it's a checked-out page | Approve it; check the page in |
| A file synced but can't be found by search | It has almost no text | Add a few sentences in SharePoint and sync again |
| Worker log says `Delta cursor no longer valid (410); listing from the beginning` | SharePoint asked KMS to re-list the site | Harmless. If it appears on **every** sync, tell the tech lead. |
| Worker log line `Site permissions re-read … updated N` | A site group changed, so every item's permissions were re-checked | Expected after T6(c) |
| ServiceNow **Test and connect** says 401 | Wrong credentials, or the instance allows only OAuth for API access | Use **OAuth client credentials** |
| ServiceNow articles still "processing" | Each article is chunked and summarized after the sync | Wait a minute and refresh |
| Someone sees a file they shouldn't | Possible bug | Note the user, the item, and what they did; screenshot; report to the tech lead right away |

---

## 7. For developers: automated tests

The same behaviour is covered by automated tests (`scripts/ekp/`). Run with `EKP_DB_TESTS=1` to include the database cases (always rolled back):

| Command | Covers |
|---|---|
| `npm run ekp:a9:test` | Reading SharePoint permissions during sync |
| `npm run ekp:a21:test` | Matching password users to Microsoft accounts by email |
| `npm run ekp:a10:test` | Enforcing permissions in repository, search, chat and experts |
| `npm run ekp:a11:test` | Permission refresh and site-group changes |
| `npm run ekp:a12:test` | Speed with 5,000 documents |
| `npm run ekp:a14:test` | No-copy mode |
| `npm run ekp:a15:test` | SharePoint pages |
| `npm run ekp:chat:test` | Chat keyword and listing questions |
| `npm run ekp:a17:test` | ServiceNow connector (stubbed Table API) |

Read-only check of who sees what, for any org:
`node --import ./scripts/task-12/register-alias-hook.mjs scripts/ekp/sharepoint-access-matrix.mjs --org <orgId>`
