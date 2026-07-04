import { Pool } from "pg";

/**
 * Seed varied event data for the existing project so the read API has something
 * to return. Spreads events across the last 7 days, multiple event names, users
 * and sessions, with a burst in the last 24h (for DAU) and a few "right now".
 * Finally refreshes the continuous aggregate so the materialized buckets are
 * current for the demo.
 */
async function seedEvents() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "gamemetrics",
    password: process.env.DB_PASSWORD ?? "gamemetrics",
    database: process.env.DB_NAME ?? "gamemetrics",
  });

  // Use the existing (oldest) project.
  const proj = await pool.query(
    "SELECT id FROM projects ORDER BY created_at ASC LIMIT 1",
  );
  if (proj.rowCount === 0) {
    throw new Error("No project found — run `npm run seed` first.");
  }
  const projectId: string = proj.rows[0].id;
  const keyRow = await pool.query(
    "SELECT key FROM api_keys WHERE project_id = $1 LIMIT 1",
    [projectId],
  );
  const apiKey: string = keyRow.rows[0].key;

  const EVENT_NAMES = [
    "app_open",
    "level_start",
    "level_complete",
    "button_click",
    "ad_view",
    "purchase",
  ];
  const USERS = Array.from({ length: 12 }, (_, i) => `player_${i + 1}`);

  const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const now = Date.now();

  type Row = [string, string, string, string, string, string];
  const rows: Row[] = [];

  const pushEvent = (tsMs: number) => {
    const eventName = pick(EVENT_NAMES);
    // ~15% of events are anonymous (no user_id) to exercise distinct-user logic.
    const anon = Math.random() < 0.15;
    const user = anon ? null : pick(USERS);
    const session = `sess_${pick(USERS)}_${Math.floor(tsMs / (1000 * 60 * 30))}`;
    const params =
      eventName === "purchase"
        ? JSON.stringify({ sku: pick(["gold_100", "gold_500", "no_ads"]), price: pick([0.99, 4.99, 2.99]) })
        : eventName === "level_complete"
          ? JSON.stringify({ level: 1 + Math.floor(Math.random() * 20), score: Math.floor(Math.random() * 10000) })
          : "{}";
    rows.push([
      projectId,
      eventName,
      user as unknown as string,
      session,
      params,
      new Date(tsMs).toISOString(),
    ]);
  };

  // Spread ~60 events per day over the last 7 days. The offset is always
  // positive (day*24h + a random slice *within* that day), so every event lands
  // strictly in the past — never in the future, which would otherwise sort above
  // genuinely-live events and break the live view's `since` cursor.
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let day = 6; day >= 0; day--) {
    const perDay = 50 + Math.floor(Math.random() * 30);
    for (let i = 0; i < perDay; i++) {
      const offset = day * DAY_MS + Math.floor(Math.random() * DAY_MS);
      pushEvent(now - offset);
    }
  }
  // A few right now, to confirm real-time aggregation surfaces fresh data.
  for (let i = 0; i < 5; i++) pushEvent(now - i * 1000);

  // Bulk insert, parameterized (6 columns per row).
  const values: string[] = [];
  const flat: (string | null)[] = [];
  rows.forEach((r, idx) => {
    const b = idx * 6;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
    flat.push(...r);
  });
  await pool.query(
    `INSERT INTO events (project_id, event_name, user_id, session_id, params, timestamp)
     VALUES ${values.join(", ")}`,
    flat,
  );

  // Materialize everything we just inserted so the hourly aggregate is current.
  await pool.query(
    "CALL refresh_continuous_aggregate('event_counts_hourly', NULL, NULL)",
  );

  console.log(`Seeded ${rows.length} events into project ${projectId}`);
  console.log(`API Key: ${apiKey}`);

  await pool.end();
}

seedEvents().catch((err) => {
  console.error("Seed-events failed:", err);
  process.exit(1);
});
