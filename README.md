
## Getting Started


First, install packages

``` bash
npm install

```
Run, the below command to build SQLite binaries

``` bash
npm rebuild better-sqlite3 --runtime=electron --target=38.1.2 --disturl=https://electronjs.org/headers

```


Run the development server:

```bash
npm run dev
```

### Building packages step by step

1. Check the nextjs build

```bash
npm run build:next
```

2. Update the patch version:

```bash
npm version patch
```

3. Start building packages in github

```bash
git push & git push --tags
```

4. Track the build in github actions:

```bash
https://github.com/mytextdigest/mytextdigest/actions
```

5. Click on the latest build version, scroll down and download the latest one.

## Task 8 review validation

Task 8 repository UI now surfaces classification confidence/status, Uncategorized documents, duplicate review actions, lifecycle suggestions, and editable category/department recommendations. Automatic classification is limited to repository documents and org-promoted project documents.

```powershell
npx prisma generate
npm run task8:test
npx eslint src worker scripts/task-8
npm run dev
```

Optional DB-level integration validation (development/test DB only):

```powershell
$env:TASK8_INTEGRATION_DB="1"
npm run task8:test:integration
Remove-Item Env:TASK8_INTEGRATION_DB
```

See `TIER1_AUTO_CLASSIFICATION_IMPLEMENTATION_TRACKER.md` for Task 8-A–8-H status and the recorded spreadsheet whole-document classification decision.
