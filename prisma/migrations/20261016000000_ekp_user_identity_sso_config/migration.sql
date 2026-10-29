-- EKP Workstream A (A-4): Microsoft sign-in identities and per-org SSO config.
-- Purely additive: two new tables. Generated with migrate diff; the false-positive
-- DROP INDEX "Chunk_embedding_vec_idx" (pgvector index Prisma can't represent) was removed.


-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSsoConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'entra',
    "tenant_id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'oidc',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "group_role_map" JSONB,
    "password_login" TEXT NOT NULL DEFAULT 'admins_only',
    "provisioning" TEXT NOT NULL DEFAULT 'auto',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSsoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_tenant_id_external_id_key" ON "UserIdentity"("provider", "tenant_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSsoConfig_orgId_key" ON "OrgSsoConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSsoConfig_tenant_id_key" ON "OrgSsoConfig"("tenant_id");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSsoConfig" ADD CONSTRAINT "OrgSsoConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

