/**
 * Database migration runner for applying Drizzle SQL migrations.
 *
 * Purpose:
 * - Connects to PostgreSQL using `DATABASE_URL`.
 * - Applies migrations from `src/db/migrations`.
 * - Exits with explicit success/failure codes for CI and deploy scripts.
 *
 * Why this does not use Drizzle's built-in `migrate()`:
 * - Drizzle's postgres-js migrator wraps the entire pending-migration batch in a
 *   single transaction. PostgreSQL forbids using a newly added enum value
 *   (`ALTER TYPE ... ADD VALUE`) within the same transaction that added it.
 *   On an established database this never surfaced because migrations were
 *   applied incrementally (each enum value committed in an earlier deploy before
 *   any later migration referenced it). On a fresh database the whole chain
 *   applies at once, so e.g. adding `'thanks_token'` to `resource_type` and then
 *   referencing `type = 'thanks_token'` in a later migration lands in one
 *   transaction and aborts the entire run.
 * - This runner instead applies each migration statement in autocommit mode, so
 *   added enum values are committed and visible to subsequent statements. The
 *   migration chain is written with `IF NOT EXISTS` guards, so re-running after a
 *   partial failure is idempotent. Applied state is recorded in
 *   `drizzle.__drizzle_migrations` using the same hash/`created_at` columns
 *   Drizzle uses, so Drizzle's native `migrate()` remains compatible afterward.
 *
 * Key exports:
 * - None (script entrypoint only).
 *
 * Dependencies:
 * - `drizzle-orm/migrator` for reading/parsing migration files (and hashing).
 * - `postgres` driver for direct migration connectivity.
 */
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

/** POSIX-compatible process exit code for successful migration execution. */
const EXIT_SUCCESS = 0;
/** POSIX-compatible process exit code for migration failures or config errors. */
const EXIT_FAILURE = 1;

/** Folder containing the generated Drizzle SQL migrations + journal. */
const MIGRATIONS_FOLDER = "./src/db/migrations";
/** Schema/table where Drizzle records applied migrations. */
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";
/** Sentinel for "no migrations applied yet" so the first migration is included. */
const NO_MIGRATIONS_APPLIED = -1;

/**
 * Applies all pending SQL migrations in order and exits the process.
 *
 * Each migration's statements are executed in autocommit mode (no enclosing
 * transaction) so that DDL such as `ALTER TYPE ... ADD VALUE` is committed
 * before later migrations reference the new value.
 *
 * @returns Promise that never resolves to a caller because the process exits.
 * @throws {never} Errors are handled internally and converted to process exit codes.
 * @example
 * ```bash
 * DATABASE_URL=postgres://... pnpm tsx src/db/migrate.ts
 * ```
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[migrate] DATABASE_URL environment variable is not set");
    process.exit(EXIT_FAILURE);
  }

  console.log("[migrate] Connecting to database...");

  // Use a dedicated single-connection client so migrations run serially and deterministically.
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`);
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (` +
        `id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );

    const lastRows = (await sql.unsafe(
      `SELECT created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ` +
        `ORDER BY created_at DESC LIMIT 1`,
    )) as unknown as Array<{ created_at: string | number | null }>;
    const lastAppliedMillis =
      lastRows.length > 0 && lastRows[0].created_at != null
        ? Number(lastRows[0].created_at)
        : NO_MIGRATIONS_APPLIED;

    console.log(`[migrate] Applying migrations from ${MIGRATIONS_FOLDER} ...`);

    let appliedCount = 0;
    for (const migration of migrations) {
      if (migration.folderMillis <= lastAppliedMillis) {
        continue;
      }

      for (const statement of migration.sql) {
        const trimmed = statement.trim();
        if (trimmed.length === 0) {
          continue;
        }
        await sql.unsafe(trimmed);
      }

      await sql.unsafe(
        `INSERT INTO "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") ` +
          `VALUES ($1, $2)`,
        [migration.hash, migration.folderMillis],
      );
      appliedCount += 1;
    }

    console.log(`[migrate] All migrations applied successfully (${appliedCount} new)`);
  } catch (error) {
    console.error("[migrate] Migration failed:", error instanceof Error ? error.message : error);
    await sql.end();
    process.exit(EXIT_FAILURE);
  }

  await sql.end();
  process.exit(EXIT_SUCCESS);
}

main();
