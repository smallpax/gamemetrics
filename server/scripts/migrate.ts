import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// Numbered migration files: 001_init.sql, 002_realtime_agg.sql, …
const MIGRATION_RE = /^(\d+)_.*\.sql$/;

/**
 * Apply every numbered migration in migrations/ in ascending order, exactly
 * once, tracking applied files in a schema_migrations table so a fresh database
 * comes up fully correct and re-running is a no-op.
 *
 * Statements within a file are sent individually (not wrapped in an explicit
 * transaction): TimescaleDB's create_hypertable() and continuous-aggregate DDL
 * cannot run inside a transaction block. We therefore record a file as applied
 * only after all of its statements succeed — granularity is per-file.
 */
async function migrate() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "gamemetrics",
    password: process.env.DB_PASSWORD ?? "gamemetrics",
    database: process.env.DB_NAME ?? "gamemetrics",
  });

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name        TEXT PRIMARY KEY,
       applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set<string>(
    (await pool.query("SELECT name FROM schema_migrations")).rows.map(
      (r) => r.name as string,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_RE.test(f))
    .sort((a, b) => {
      const na = Number(a.match(MIGRATION_RE)![1]);
      const nb = Number(b.match(MIGRATION_RE)![1]);
      return na - nb;
    });

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    process.stdout.write(`apply ${file} … `);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.log("done");
    ran++;
  }

  console.log(
    ran === 0
      ? "Migrations already up to date."
      : `Migration complete (${ran} applied).`,
  );
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
