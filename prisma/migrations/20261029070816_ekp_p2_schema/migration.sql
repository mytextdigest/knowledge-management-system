-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "asset_data" JSONB,
ADD COLUMN     "content_updated_at" TIMESTAMP(3),
ADD COLUMN     "duration_seconds" DOUBLE PRECISION,
ADD COLUMN     "media_segments" JSONB,
ADD COLUMN     "template_version_id" TEXT,
ADD COLUMN     "thumbnail_path" TEXT,
ADD COLUMN     "transcript_link_source" TEXT,
ADD COLUMN     "transcript_of_id" TEXT;

-- AlterTable
ALTER TABLE "KnowledgeGap" ADD COLUMN     "query_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN     "files_skipped" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TermSet" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'local',
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "external_id" TEXT,
    "import_format" TEXT,
    "last_imported_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "TermSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "term_set_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "merged_into_id" TEXT,
    "ancestor_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "external_id" TEXT,
    "term_store_guid" TEXT,
    "embedding_vec" vector(1536),
    "embedded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermSynonym" (
    "id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'alt',

CONSTRAINT "TermSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermRelation" (
    "id" TEXT NOT NULL,
    "from_term_id" TEXT NOT NULL,
    "to_term_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'related',

CONSTRAINT "TermRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetadataField" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "term_set_id" TEXT NOT NULL,
    "multi" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "facet" BOOLEAN NOT NULL DEFAULT false,
    "facet_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "MetadataField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTerm" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "confidence" DOUBLE PRECISION,
    "created_by_id" TEXT,
    "accepted_by_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "DocumentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermCandidate" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "suggested_term_set_id" TEXT,
    "suggested_parent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "accepted_term_id" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "TermCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxonomyImport" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "term_set_id" TEXT,
    "format" TEXT NOT NULL,
    "file_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'parsing',
    "summary" JSONB,
    "error" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

CONSTRAINT "TaxonomyImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchEvent" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT,
    "kind" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalized_query" TEXT NOT NULL,
    "filters" JSONB,
    "result_count" INTEGER NOT NULL,
    "answer_shown" BOOLEAN NOT NULL DEFAULT false,
    "confidence" TEXT,
    "latency_ms" INTEGER,
    "first_token_ms" INTEGER,
    "department_id" TEXT,
    "role" TEXT,
    "previous_event_id" TEXT,
    "org_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "SearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchClick" (
    "id" TEXT NOT NULL,
    "search_event_id" TEXT NOT NULL,
    "document_id" TEXT,
    "rank" INTEGER NOT NULL,
    "chunk_ref" JSONB,
    "dwell_seconds" INTEGER,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "SearchClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "department_key" TEXT NOT NULL DEFAULT 'all',
    "source_system" TEXT NOT NULL DEFAULT 'all',
    "value" DOUBLE PRECISION NOT NULL,
    "dims" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "url_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "http_status" INTEGER,
    "checked_at" TIMESTAMP(3),
    "first_broken_at" TIMESTAMP(3),

CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingApiKey" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "created_by_id" TEXT,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "ReportingApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSourceTag" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'sharepoint',
    "field_name" TEXT NOT NULL,
    "field_display_name" TEXT,
    "label" TEXT NOT NULL,
    "term_guid" TEXT NOT NULL,
    "term_set_guid" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "DocumentSourceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "audio_seconds" DOUBLE PRECISION,
    "cost_usd" DECIMAL(10,4),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTemplate" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "AssetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTemplateVersion" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "required_fields" JSONB NOT NULL DEFAULT '[]',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "AssetTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermSet_org_id_source_idx" ON "TermSet"("org_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "TermSet_org_id_name_key" ON "TermSet"("org_id", "name");

-- CreateIndex
CREATE INDEX "Term_term_set_id_parent_id_idx" ON "Term"("term_set_id", "parent_id");

-- CreateIndex
CREATE INDEX "Term_term_set_id_normalized_label_idx" ON "Term"("term_set_id", "normalized_label");

-- CreateIndex
CREATE INDEX "Term_ancestor_ids_idx" ON "Term" USING GIN ("ancestor_ids");

-- CreateIndex
CREATE INDEX "Term_term_store_guid_idx" ON "Term"("term_store_guid");

-- CreateIndex
CREATE INDEX "Term_status_idx" ON "Term"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Term_term_set_id_external_id_key" ON "Term"("term_set_id", "external_id");

-- CreateIndex
CREATE INDEX "TermSynonym_normalized_label_idx" ON "TermSynonym"("normalized_label");

-- CreateIndex
CREATE UNIQUE INDEX "TermSynonym_term_id_normalized_label_key" ON "TermSynonym"("term_id", "normalized_label");

-- CreateIndex
CREATE INDEX "TermRelation_to_term_id_idx" ON "TermRelation"("to_term_id");

-- CreateIndex
CREATE UNIQUE INDEX "TermRelation_from_term_id_to_term_id_kind_key" ON "TermRelation"("from_term_id", "to_term_id", "kind");

-- CreateIndex
CREATE INDEX "MetadataField_org_id_facet_idx" ON "MetadataField"("org_id", "facet");

-- CreateIndex
CREATE UNIQUE INDEX "MetadataField_org_id_key_key" ON "MetadataField"("org_id", "key");

-- CreateIndex
CREATE INDEX "DocumentTerm_term_id_status_idx" ON "DocumentTerm"("term_id", "status");

-- CreateIndex
CREATE INDEX "DocumentTerm_field_id_term_id_idx" ON "DocumentTerm"("field_id", "term_id");

-- CreateIndex
CREATE INDEX "DocumentTerm_document_id_idx" ON "DocumentTerm"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTerm_document_id_field_id_term_id_key" ON "DocumentTerm"("document_id", "field_id", "term_id");

-- CreateIndex
CREATE INDEX "TermCandidate_org_id_status_idx" ON "TermCandidate"("org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TermCandidate_org_id_normalized_label_key" ON "TermCandidate"("org_id", "normalized_label");

-- CreateIndex
CREATE INDEX "TaxonomyImport_org_id_created_at_idx" ON "TaxonomyImport"("org_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "SearchEvent_org_message_id_key" ON "SearchEvent"("org_message_id");

-- CreateIndex
CREATE INDEX "SearchEvent_org_id_created_at_idx" ON "SearchEvent"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "SearchEvent_org_id_normalized_query_idx" ON "SearchEvent"("org_id", "normalized_query");

-- CreateIndex
CREATE INDEX "SearchEvent_org_id_result_count_created_at_idx" ON "SearchEvent"("org_id", "result_count", "created_at");

-- CreateIndex
CREATE INDEX "SearchEvent_user_id_created_at_idx" ON "SearchEvent"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "SearchClick_search_event_id_idx" ON "SearchClick"("search_event_id");

-- CreateIndex
CREATE INDEX "SearchClick_document_id_idx" ON "SearchClick"("document_id");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_org_id_metric_date_idx" ON "AnalyticsDaily"("org_id", "metric", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_org_id_date_metric_department_key_source_sys_key" ON "AnalyticsDaily"("org_id", "date", "metric", "department_key", "source_system");

-- CreateIndex
CREATE INDEX "DocumentLink_status_checked_at_idx" ON "DocumentLink"("status", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_document_id_url_hash_key" ON "DocumentLink"("document_id", "url_hash");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingApiKey_key_hash_key" ON "ReportingApiKey"("key_hash");

-- CreateIndex
CREATE INDEX "ReportingApiKey_org_id_idx" ON "ReportingApiKey"("org_id");

-- CreateIndex
CREATE INDEX "DocumentSourceTag_term_guid_idx" ON "DocumentSourceTag"("term_guid");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSourceTag_document_id_field_name_term_guid_key" ON "DocumentSourceTag"("document_id", "field_name", "term_guid");

-- CreateIndex
CREATE INDEX "MediaJob_document_id_created_at_idx" ON "MediaJob"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "MediaJob_status_created_at_idx" ON "MediaJob"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTemplate_org_id_name_key" ON "AssetTemplate"("org_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTemplateVersion_template_id_version_key" ON "AssetTemplateVersion"("template_id", "version");

-- CreateIndex
CREATE INDEX "Document_orgId_content_updated_at_idx" ON "Document"("orgId", "content_updated_at");

-- CreateIndex
CREATE INDEX "Document_transcript_of_id_idx" ON "Document"("transcript_of_id");

-- CreateIndex
CREATE INDEX "Document_template_version_id_idx" ON "Document"("template_version_id");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_transcript_of_id_fkey" FOREIGN KEY ("transcript_of_id") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "AssetTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermSet" ADD CONSTRAINT "TermSet_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermSet" ADD CONSTRAINT "TermSet_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_term_set_id_fkey" FOREIGN KEY ("term_set_id") REFERENCES "TermSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermSynonym" ADD CONSTRAINT "TermSynonym_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_from_term_id_fkey" FOREIGN KEY ("from_term_id") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_to_term_id_fkey" FOREIGN KEY ("to_term_id") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetadataField" ADD CONSTRAINT "MetadataField_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetadataField" ADD CONSTRAINT "MetadataField_term_set_id_fkey" FOREIGN KEY ("term_set_id") REFERENCES "TermSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTerm" ADD CONSTRAINT "DocumentTerm_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTerm" ADD CONSTRAINT "DocumentTerm_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTerm" ADD CONSTRAINT "DocumentTerm_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "MetadataField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTerm" ADD CONSTRAINT "DocumentTerm_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTerm" ADD CONSTRAINT "DocumentTerm_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermCandidate" ADD CONSTRAINT "TermCandidate_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermCandidate" ADD CONSTRAINT "TermCandidate_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyImport" ADD CONSTRAINT "TaxonomyImport_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxonomyImport" ADD CONSTRAINT "TaxonomyImport_term_set_id_fkey" FOREIGN KEY ("term_set_id") REFERENCES "TermSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEvent" ADD CONSTRAINT "SearchEvent_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEvent" ADD CONSTRAINT "SearchEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEvent" ADD CONSTRAINT "SearchEvent_previous_event_id_fkey" FOREIGN KEY ("previous_event_id") REFERENCES "SearchEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEvent" ADD CONSTRAINT "SearchEvent_org_message_id_fkey" FOREIGN KEY ("org_message_id") REFERENCES "OrgMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchClick" ADD CONSTRAINT "SearchClick_search_event_id_fkey" FOREIGN KEY ("search_event_id") REFERENCES "SearchEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchClick" ADD CONSTRAINT "SearchClick_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDaily" ADD CONSTRAINT "AnalyticsDaily_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingApiKey" ADD CONSTRAINT "ReportingApiKey_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingApiKey" ADD CONSTRAINT "ReportingApiKey_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSourceTag" ADD CONSTRAINT "DocumentSourceTag_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTemplate" ADD CONSTRAINT "AssetTemplate_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTemplate" ADD CONSTRAINT "AssetTemplate_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTemplateVersion" ADD CONSTRAINT "AssetTemplateVersion_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "AssetTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
