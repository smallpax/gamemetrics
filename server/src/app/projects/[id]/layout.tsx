import { requireOwnedProject } from "@/lib/portal";

/**
 * Authorization gate for every /projects/[id] route (dashboard, event detail,
 * live). Ownership is enforced in the data layer (requireOwnedProject →
 * getOwnedProject), NOT in middleware — CVE-2025-29927 showed middleware gates
 * are bypassable. Each child page independently re-checks too (defense in
 * depth); the cache() around requireOwnedProject collapses those to one query.
 *
 * The check is duplicated in generateMetadata purely to guarantee a real HTTP
 * 404 status: metadata resolves before Next flushes the streamed shell, so a
 * notFound() there sets the status, whereas the same throw in a streamed body
 * can race the flush and surface as 200. Not-owned and missing projects both
 * 404 so ownership isn't leaked.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project } = await requireOwnedProject(id); // 404s here if not owned
  return { title: `${project.name} — GameMetrics` };
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireOwnedProject(id); // data-layer guard (cached; no extra query)
  return <>{children}</>;
}
