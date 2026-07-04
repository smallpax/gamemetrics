"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db";
import { requireUser } from "@/lib/portal";

/**
 * Create a project owned by the logged-in user and generate its first API key.
 * The key is produced by the api_keys table's existing default (the same key
 * generation the seed/ingestion path already relies on) — not hand-rolled here.
 */
export async function createProject(formData: FormData): Promise<void> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 100) {
    // The form enforces this too; guard here since actions are directly callable.
    throw new Error("Project name must be 1–100 characters");
  }

  const proj = await db.query(
    "INSERT INTO projects (name, owner_id) VALUES ($1, $2) RETURNING id",
    [name, user.id],
  );
  await db.query("INSERT INTO api_keys (project_id) VALUES ($1)", [
    proj.rows[0].id,
  ]);

  revalidatePath("/");
}
