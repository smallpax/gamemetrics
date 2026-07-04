import { Pool } from "pg";

/**
 * Tidy the demo dataset so the portal looks like a real account:
 *
 *  1. Remove the stray "ping" test event from the first (original) project.
 *  2. Seed a second project with a different name and a small/sparse set of
 *     events, so the projects list reads like a real list and one dashboard
 *     shows the near-empty state.
 *
 * Idempotent: deleting ping events is naturally repeatable, and the second
 * project is only created if a project with its name doesn't already exist.
 */

const SECOND_PROJECT_NAME = "Puzzle Quest";

async function cleanDemo() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "gamemetrics",
    password: process.env.DB_PASSWORD ?? "gamemetrics",
    database: process.env.DB_NAME ?? "gamemetrics",
  });

  // --- 1. Remove the stray ping test event from the first project ----------
  const firstProj = await pool.query(
    "SELECT id, name FROM projects ORDER BY created_at ASC LIMIT 1",
  );
  if (firstProj.rowCount === 0) {
    throw new Error("No projects found — run `npm run seed` first.");
  }
  const firstId: string = firstProj.rows[0].id;

  const del = await pool.query(
    "DELETE FROM events WHERE project_id = $1 AND event_name = 'ping'",
    [firstId],
  );
  console.log(
    `Removed ${del.rowCount} ping event(s) from "${firstProj.rows[0].name}".`,
  );

  // --- 2. Seed a sparse second project -------------------------------------
  const existing = await pool.query(
    "SELECT id FROM projects WHERE name = $1",
    [SECOND_PROJECT_NAME],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log(
      `Second project "${SECOND_PROJECT_NAME}" already exists — skipping seed.`,
    );
    await pool.end();
    return;
  }

  const proj = await pool.query(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    [SECOND_PROJECT_NAME],
  );
  const projectId: string = proj.rows[0].id;
  const key = await pool.query(
    "INSERT INTO api_keys (project_id) VALUES ($1) RETURNING key",
    [projectId],
  );
  const apiKey: string = key.rows[0].key;

  // A deliberately sparse trickle: a handful of events over the last few days,
  // so the dashboard reads as a quiet/near-empty project rather than no data.
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  type Sparse = { name: string; user: string | null; ago: number; params: object };
  const sparse: Sparse[] = [
    { name: "app_open", user: "tester_1", ago: 50 * HOUR, params: {} },
    { name: "level_start", user: "tester_1", ago: 49 * HOUR, params: { level: 1 } },
    { name: "app_open", user: "tester_2", ago: 26 * HOUR, params: {} },
    { name: "level_start", user: "tester_2", ago: 25 * HOUR, params: { level: 1 } },
    { name: "level_complete", user: "tester_2", ago: 25 * HOUR, params: { level: 1, score: 320 } },
    { name: "app_open", user: "tester_1", ago: 3 * HOUR, params: {} },
    { name: "button_click", user: "tester_1", ago: 2 * HOUR, params: { button: "settings" } },
    { name: "app_open", user: null, ago: 20 * 60 * 1000, params: {} },
  ];

  const values: string[] = [];
  const flat: (string | null)[] = [];
  sparse.forEach((e, idx) => {
    const b = idx * 6;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
    flat.push(
      projectId,
      e.name,
      e.user,
      e.user ? `sess_${e.user}` : null,
      JSON.stringify(e.params),
      new Date(now - e.ago).toISOString(),
    );
  });
  await pool.query(
    `INSERT INTO events (project_id, event_name, user_id, session_id, params, timestamp)
     VALUES ${values.join(", ")}`,
    flat,
  );

  // Keep the hourly continuous aggregate current for the new project.
  await pool.query(
    "CALL refresh_continuous_aggregate('event_counts_hourly', NULL, NULL)",
  );

  console.log(
    `Seeded ${sparse.length} sparse events into "${SECOND_PROJECT_NAME}" (${projectId}).`,
  );
  console.log(`API Key: ${apiKey}`);

  await pool.end();
}

cleanDemo().catch((err) => {
  console.error("Clean-demo failed:", err);
  process.exit(1);
});
