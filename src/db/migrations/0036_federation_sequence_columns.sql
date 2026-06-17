-- Reconcile federation tables with schema.ts. These columns + indexes are
-- declared in src/db/schema.ts but were never emitted as migrations, so a
-- fresh database is missing them and the federation events/sync endpoints
-- fail: the events feed selects federation_events.sequence and ensureLocalNode
-- relationally selects the nodes multi-instance registry columns (instance_type,
-- primary_agent_id, ...). The global repo carries the same reconciliation in
-- 0045_nodes_instance_columns.sql; this brings the locale lineage in line.

-- federation_events: monotonic export cursor + actor binding + causal tracking
ALTER TABLE "federation_events" ADD COLUMN IF NOT EXISTS "sequence" bigserial;
ALTER TABLE "federation_events" ADD COLUMN IF NOT EXISTS "actor_id" uuid REFERENCES "agents"("id");
ALTER TABLE "federation_events" ADD COLUMN IF NOT EXISTS "correlation_id" text;
ALTER TABLE "federation_events" ADD COLUMN IF NOT EXISTS "causation_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "federation_events_nonce_idx" ON "federation_events" ("nonce");
CREATE INDEX IF NOT EXISTS "federation_events_entity_version_idx" ON "federation_events" ("entity_type","entity_id","event_version");
CREATE INDEX IF NOT EXISTS "idx_federation_events_sequence" ON "federation_events" ("sequence");
CREATE INDEX IF NOT EXISTS "idx_federation_events_actor_id" ON "federation_events" ("actor_id");
CREATE INDEX IF NOT EXISTS "idx_federation_events_origin_sequence" ON "federation_events" ("origin_node_id","sequence");

-- nodes: multi-instance registry columns (mirrors global 0045)
DO $$ BEGIN
  CREATE TYPE instance_type AS ENUM ('global', 'person', 'group', 'locale', 'region');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE migration_status AS ENUM ('active', 'migrating_out', 'migrating_in', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "instance_type" instance_type DEFAULT 'global';
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "primary_agent_id" uuid REFERENCES agents(id);
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "storage_namespace" text;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '[]';
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "health_check_url" text;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "last_health_check" timestamptz;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "event_sequence" bigint DEFAULT 0;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "migration_status" migration_status DEFAULT 'active';
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "fee_wallet_address" text;

CREATE INDEX IF NOT EXISTS "idx_nodes_instance_type" ON "nodes"("instance_type");
CREATE INDEX IF NOT EXISTS "idx_nodes_primary_agent_id" ON "nodes"("primary_agent_id");
CREATE INDEX IF NOT EXISTS "idx_nodes_migration_status" ON "nodes"("migration_status");
