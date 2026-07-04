import { Pool } from "pg";

async function seed() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "gamemetrics",
    password: process.env.DB_PASSWORD ?? "gamemetrics",
    database: process.env.DB_NAME ?? "gamemetrics",
  });

  const project = await pool.query(
    "INSERT INTO projects (name) VALUES ($1) RETURNING id",
    ["Test Game"],
  );
  const projectId = project.rows[0].id;

  const key = await pool.query(
    "INSERT INTO api_keys (project_id) VALUES ($1) RETURNING key",
    [projectId],
  );
  const apiKey = key.rows[0].key;

  console.log(`Project ID : ${projectId}`);
  console.log(`API Key    : ${apiKey}`);
  console.log(`\nTest with:\n`);
  console.log(`curl -X POST http://localhost:3000/v1/events \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "x-api-key: ${apiKey}" \\`);
  console.log(`  -d '{"event_name":"level_complete","user_id":"player_1","params":{"level":3,"score":9500}}'`);

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
