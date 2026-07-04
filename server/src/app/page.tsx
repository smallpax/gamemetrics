import Link from "next/link";
import { requireUser, listProjects } from "@/lib/portal";
import { createProject } from "@/lib/actions";
import { formatNumber } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              Projects
            </h1>
            <p className="mt-1 text-sm text-muted">
              {projects.length === 0
                ? "Create a project to start collecting events."
                : "Select a project to view its analytics, or copy its API key to integrate."}
            </p>
          </div>
          <form action={createProject} className="flex items-center gap-2">
            <input
              name="name"
              required
              maxLength={100}
              placeholder="New project name"
              className="w-52 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-accent/20"
            >
              Create
            </button>
          </form>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState
              title="No projects"
              message="Create your first project above to get an API key and start collecting events."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Project</th>
                  <th className="px-5 py-3 text-right font-medium">Events</th>
                  <th className="px-5 py-3 font-medium">API key</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="group transition-colors hover:bg-surface-2/50"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-fg hover:text-accent"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-faint">
                        {p.id}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-muted">
                      {formatNumber(p.eventCount)}
                    </td>
                    <td className="px-5 py-4">
                      {p.apiKey ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-base px-2 py-1 font-mono text-xs text-muted">
                            {maskKey(p.apiKey)}
                          </code>
                          <CopyButton value={p.apiKey} />
                        </div>
                      ) : (
                        <span className="text-xs text-faint">none</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/projects/${p.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors group-hover:text-fg"
                      >
                        Dashboard
                        <span aria-hidden>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

/** Show enough of the key to recognize it, hide the middle. */
function maskKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}
