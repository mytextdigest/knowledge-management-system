// Dev tool (A-9): print the DocumentAcl rows KMS would store for every file
// in an org's connected SharePoint sites. Read-only: writes nothing to KMS
// or SharePoint.
//   node scripts/ekp/sharepoint-acl-dryrun.mjs --org <orgId>
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getAppOnlyToken, getDelta, getSiteDriveId } from "../../src/lib/msGraph.js";
import { createAclResolver } from "../../src/lib/connectors/sharepointAcl.js";

const orgId = process.argv[process.argv.indexOf("--org") + 1];
if (!orgId || orgId.startsWith("--")) {
  console.error("Usage: node scripts/ekp/sharepoint-acl-dryrun.mjs --org <orgId>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const integration = await prisma.orgIntegration.findUnique({ where: { orgId_provider: { orgId, provider: "sharepoint" } } });
  if (!integration) throw new Error("This org has no SharePoint integration");
  const { tenantId, sites = [] } = integration.scopeConfig;
  const { accessToken } = await getAppOnlyToken(tenantId);
  const resolver = createAclResolver({ graphToken: accessToken, tenantId });
  if (!resolver) throw new Error("SharePoint certificate not configured (SHAREPOINT_CERT_PATH / SHAREPOINT_CERT_KEY_PATH)");

  for (const site of sites) {
    console.log(`\n=== ${site.siteUrl}`);
    const driveId = await getSiteDriveId({ accessToken, siteId: site.siteId });
    const { items } = await getDelta({ accessToken, siteId: site.siteId });
    for (const item of items.filter((i) => i.file && !i.deleted)) {
      const rows = await resolver.itemAcl({ driveId: item.parentReference?.driveId || driveId, itemId: item.id, siteUrl: site.siteUrl });
      console.log(`${item.name}\n  ${rows.map((r) => `${r.principalType}:${r.principalId}`).join("\n  ") || "(nobody)"}`);
    }
  }
} finally {
  await prisma.$disconnect();
}
