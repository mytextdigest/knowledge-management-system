# Integration Spec: Sign in with Microsoft

| | |
|---|---|
| **Status** | Built and tested (OIDC). |
| **Owner** | Johurul (Workstream A) |
| **Requirements** | PRS E32.1, RFP §6 S2 |
| **Full design** | [WS_A_M365_CONNECTORS.md](WS_A_M365_CONNECTORS.md) §4 A1 · Test steps: [WS_A_TEST_MANUAL.md](WS_A_TEST_MANUAL.md) T1–T2 |

## 1. Background: what you need to know first

**Microsoft 365 (M365)** is the bundle most large organizations run on: Outlook, Teams, Word, Excel, SharePoint, OneDrive. Everyone at the company has one work account (for example `jane.doe@nypa.gov`) that opens all of it.

**Microsoft Entra ID** (formerly *Azure Active Directory*, often still called "Azure AD" or just "AD") is the part of M365 that holds those accounts. It's the company's phone book and front door in one:

- every employee and contractor has an account there;
- people are put into **groups** (for example "Engineering Team", "Finance Managers");
- IT sets security rules there, like **MFA** (a code on your phone) or "only from a company laptop".

**Tenant** = one organization's own copy of Entra ID. NYPA has one tenant. Our test tenant is `nextgenerationinnovation.onmicrosoft.com`.

**Single sign-on (SSO)** means an app doesn't keep its own passwords. It sends you to Microsoft, Microsoft checks who you are, and sends you back with a signed "this is Jane" token. **OIDC** and **SAML** are two standard formats for that token; they do the same job.

## 2. Why this matters to KMS

| Without it | With it |
|---|---|
| Every employee creates and remembers a separate KMS password | They click **Sign in with Microsoft** and use the account they already have |
| IT can't apply its MFA and device rules to KMS | Microsoft's MFA and Conditional Access apply automatically |
| When someone leaves, IT must remember to remove them from KMS too | Disable the Microsoft account and they can't sign in to KMS |
| Admins assign KMS roles by hand | Roles and departments follow the person's Microsoft groups |
| KMS can't tell which SharePoint files a user may open | KMS knows the user's Microsoft identity, which the [SharePoint integration](INTEGRATION_SHAREPOINT.md) needs to enforce permissions |

**For NYPA specifically:** the RFP lists "Login with NYPA Active Directory (SAML)" as a security requirement (§6 S2). Enterprise buyers generally treat SSO as non-negotiable: it's one of the first things their security team checks.

## 3. How it works (user's view)

1. The user opens KMS and types their work email.
2. KMS sees the email's domain belongs to an organization that has turned on Microsoft sign-in, and sends them to Microsoft.
3. Microsoft asks for their password and MFA (or skips it if they're already signed in to Office that day).
4. Microsoft sends them back to KMS. They're in, in the right organization, with the right role.

A first-time user gets a KMS account created automatically; no invite or sign-up form is needed (unless the admin chose *invite only*).

```
 User ──▶ KMS sign-in page ──▶ Microsoft (password + MFA) ──▶ KMS
          "jane@nypa.gov"       checks who Jane is             reads the signed token:
          → domain is SSO                                       tenant, user id, email, groups
                                                                → finds/creates Jane, applies role
```

## 4. How it works (admin's view)

Done once per organization by a KMS **super admin** together with someone who is an admin of the company's Microsoft tenant.

1. In KMS: **Org Settings → Integrations → Microsoft sign-in → Connect Microsoft.**
2. Microsoft shows a consent screen for the "KMS Sign-in" app. The company's Microsoft admin approves it. This is a normal step for any app the company lets employees sign in to.
3. Back in KMS, the admin picks which email domains belong to the org (only domains Microsoft says the tenant owns are offered).
4. Optional settings:
   - **Who can join:** anyone in the tenant (default), or invited people only.
   - **Password login:** keep passwords for super admins only (break-glass), or for everyone.
   - **Roles from Microsoft groups:** for example "KMS-Engineering group → Dept Admin of Engineering". Applied at every sign-in, so removing someone from the group removes the role next time.

On the Microsoft side, the company can additionally limit which employees may use KMS and require MFA for it. Those rules live in their tenant; KMS doesn't need to change.

## 5. What we built

| Feature | Notes |
|---|---|
| "Sign in with Microsoft" button + email-first redirect | Users on an SSO domain go straight to Microsoft |
| Automatic account creation and linking | An existing KMS password user with the same email is linked, not duplicated |
| One Microsoft tenant ↔ one KMS org | A second org can't claim the same tenant |
| Safe email linking | Only emails on the tenant's verified domains are linked to existing accounts (prevents a known account-takeover trick) |
| Group → role/department mapping | Highest mapped role wins; hand-set roles are never lowered; handles users in 200+ groups |
| Password login restriction | `admins_only` blocks passwords for members once SSO is on |
| Audit log | Every SSO login, new user, settings change and role change is recorded |

**Design choice worth knowing:** KMS uses **two separate apps** in Microsoft. The *Sign-in* app (used by every employee) can only sign people in and read their groups; it has no access to any files. The *SharePoint connector* app (used only by the background sync) has file access. If one is misused, the other isn't exposed, and the customer can turn either on independently.

## 6. What it doesn't do

- **No SAML yet.** OIDC works today. SAML (what NYPA's RFP names) uses the same sign-in path and is planned after the WS-A/WS-B merge (`A-16`).
- **Personal Microsoft accounts** (`@outlook.com`, `@hotmail.com`) can't sign in this way. Work accounts only.
- **Users are never deleted automatically.** If someone loses all mapped groups, they keep their account at the base role.
- **Guests from other companies** (B2B contractors whose email isn't on the tenant's domains) are refused for now.
- KMS never changes anything in the customer's Microsoft tenant.

## 7. Where things are

| What | Where |
|---|---|
| Sign-in logic | `src/lib/auth.js`, `src/lib/sso/entra.js`, `src/lib/sso/groupMapping.js` |
| Admin page | `src/app/(app)/org/[orgId]/integrations/microsoft-sso/page.jsx`, API `api/org/[orgId]/sso` |
| Data | `OrgSsoConfig` (one row per org), `UserIdentity` (links a KMS user to their Microsoft account) |
| Config | `ENTRA_SSO_CLIENT_ID`, `ENTRA_SSO_CLIENT_SECRET` (the KMS Sign-in app; ask the tech lead) |
| Tests | `scripts/ekp/a1-entra-signin.test.mjs`, `scripts/ekp/a1-group-mapping.test.mjs` |
| Try it | Test org **NGI**, test users `emp1@` / `emp2@` / `emp3@nextgenerationinnovation.onmicrosoft.com` (passwords from the tech lead) |

## 8. Glossary

| Term | Meaning |
|---|---|
| Entra ID / Azure AD | Microsoft's directory of a company's accounts and groups |
| Tenant | One organization's Entra ID |
| SSO | Signing in to many apps with one account |
| OIDC / SAML | Two standard ways Microsoft tells an app "this user is who they say" |
| MFA | Second check at sign-in, such as a phone code |
| Conditional Access | Entra rules like "MFA required" or "company device only" |
| Admin consent | A tenant admin approving an outside app for their whole company |
| Object id (`oid`) | A user's permanent id in Entra; KMS uses it instead of the email, which can change |
