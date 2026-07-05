import { Pool } from "pg";
import { auth } from "../src/lib/auth";

/**
 * Seed a demo portal user and assign the pre-existing demo projects to them so
 * the current demo data stays viewable after login is introduced.
 *
 * The user is created THROUGH Better Auth (auth.api.signUpEmail) so the password
 * is hashed by the library exactly as a real signup would be — we never write
 * the `user`/`account` rows by hand. Re-running is idempotent: if the demo user
 * already exists we just re-resolve their id and (re)assign the projects.
 */

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@gamemetrics.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";
const DEMO_NAME = "Demo User";

async function seedAuth() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "gamemetrics",
    password: process.env.DB_PASSWORD ?? "gamemetrics",
    database: process.env.DB_NAME ?? "gamemetrics",
  });

  // Create the demo user via the auth library, or reuse it if it already exists.
  let userId: string;
  try {
    const res = await auth.api.signUpEmail({
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: DEMO_NAME },
    });
    userId = res.user.id;
    console.log(`Created demo user ${DEMO_EMAIL}`);
  } catch {
    const existing = await pool.query(
      'SELECT id FROM "user" WHERE email = $1',
      [DEMO_EMAIL],
    );
    if (existing.rowCount === 0) {
      throw new Error(
        "Demo user could not be created and does not already exist.",
      );
    }
    userId = existing.rows[0].id;
    console.log(`Demo user ${DEMO_EMAIL} already exists — reusing.`);
  }

  // Claim every pre-existing, still-unowned project for the demo user. On a
  // fresh seed these are exactly the demo dataset created by `seed` /
  // `seed:events` / `clean:demo` (e.g. the populated "Test Game" and the sparse
  // "Puzzle Quest"), so the demo login lands on projects that already have
  // events — rather than an empty project created here. Matching on
  // `owner_id IS NULL` instead of hard-coded names keeps this robust to what the
  // upstream seeds happen to name their projects.
  const assigned = await pool.query(
    `UPDATE projects SET owner_id = $1
     WHERE owner_id IS NULL
     RETURNING name`,
    [userId],
  );
  if ((assigned.rowCount ?? 0) > 0) {
    console.log(
      `Assigned ${assigned.rowCount} existing project(s) to demo user: ` +
        assigned.rows.map((r) => r.name).join(", "),
    );
  }

  // If the demo user still owns nothing (e.g. a fresh database where `seed`
  // created a differently-named project, or wasn't run), create a demo project
  // and API key so the demo login always has usable data.
  const owned = await pool.query(
    "SELECT count(*)::int AS n FROM projects WHERE owner_id = $1",
    [userId],
  );
  if (owned.rows[0].n === 0) {
    const proj = await pool.query(
      "INSERT INTO projects (name, owner_id) VALUES ($1, $2) RETURNING id",
      ["Sample Project", userId],
    );
    const key = await pool.query(
      "INSERT INTO api_keys (project_id) VALUES ($1) RETURNING key",
      [proj.rows[0].id],
    );
    console.log(
      `Created demo project "Sample Project" for the demo user.\n` +
        `API Key  : ${key.rows[0].key}`,
    );
  }

  console.log("\n--- Demo portal credentials ---");
  console.log(`Email    : ${DEMO_EMAIL}`);
  console.log(`Password : ${DEMO_PASSWORD}`);
  console.log("Log in at http://localhost:3000/login");

  await pool.end();
}

seedAuth()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed-auth failed:", err);
    process.exit(1);
  });
