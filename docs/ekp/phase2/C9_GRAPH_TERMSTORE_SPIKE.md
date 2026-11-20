# C-9: Reading the SharePoint term store through Microsoft Graph

**Run:** 2026-11-16, test tenant `nextgenerationinnovation.onmicrosoft.com`, the KMS Entra app used by the SharePoint connector (app-only token). Read-only `GET` calls; nothing was written to the tenant.

## Result

The connector's app **can't read the tenant's term store** with the permissions NYPA is likely to grant (`Sites.Selected`). File import (SKOS/CSV, C-6) stays the supported path, as planned (CQ-4).

| Call (v1.0) | Result |
| --- | --- |
| Token roles | `Sites.Selected`, `User.Read.All`, `GroupMember.Read.All` (no `TermStore.*`) |
| `GET /sites/{site}/termStore/groups` (3 granted sites) | 200, **0 groups**: only site-collection term groups are visible, and the tenant's groups aren't |
| `GET /sites/{site}/termStore/sets` | 404 `itemNotFound` ("TermSet could not be found"): sets are listed under a group |
| `GET /sites/{site}/termStore` (Engineering site) | 404 `itemNotFound` ("Cannot find termStore") |
| `GET /termStore/sets` (tenant level) | 400: v1.0 has no tenant-level `termStore` segment; the store is reached through a site |

The synced test file's "NGI Topics" tag (term GUID `1e117ab2-…`) has no term-set GUID in the item's field value, so the set can't be addressed directly either.

## What this means

- **Reading the term store needs `TermStore.Read.All`** (application, admin consent) on top of `Sites.Selected`. That is a tenant-wide read; it is NYPA's M365 governance team's decision (CQ-4).
- **Matching SharePoint tags to imported terms doesn't depend on it.** C-8 matches a tag by term-store GUID when the imported concept carries it (a GUID inside the concept URI is stored as `Term.termStoreGuid`), and otherwise by label path, never guessing between two candidates. On NGI's test file the tag mapped by GUID (verified on the shared DB inside a rolled-back transaction).
- **If NYPA grants `TermStore.Read.All` after award**, a `termstore` source (the `TaxonomyImport.format` value already exists) can list `groups → sets → terms` with paging and feed the same preview/apply path as a file import.

## Still to check with NYPA (after award)

1. Whether `TermStore.Read.All` can be granted alongside `Sites.Selected`.
2. Whether Semaphore's SKOS export keeps term-store GUIDs in concept URIs or in a property (CQ-1). If it uses a property, map it to `Term.termStoreGuid` in the importer.
