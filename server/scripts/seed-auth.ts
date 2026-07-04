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
const DEMO_PROJECTS = ["Sample Project", "Puzzle Quest"];

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

  // Assign the existing demo projects to the demo user.
  const assigned = await pool.query(
    `UPDATE projects SET owner_id = $1
     WHERE name = ANY($2::text[])
     RETURNING name`,
    [userId, DEMO_PROJECTS],
  );

  console.log(
    `Assigned ${assigned.rowCount} project(s) to demo user: ` +
      assigned.rows.map((r) => r.name).join(", "),
  );

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
