import { requireOwnedProject } from "@/lib/portal";
import { AppHeader } from "@/components/AppHeader";
import { LiveEventStream } from "@/components/LiveEventStream";

export const dynamic = "force-dynamic";

export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { user, project } = await requireOwnedProject(id);

  return (
    <>
      <AppHeader
        crumbs={[
          { label: project.name, href: `/projects/${id}` },
          { label: "Live" },
        ]}
        user={user}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Live events
          </h1>
          <p className="mt-1 text-sm text-muted">
            A real-time view of events as they arrive for {project.name}.
          </p>
        </div>

        <LiveEventStream pollUrl={`/projects/${id}/live/recent`} />
      </main>
    </>
  );
}
