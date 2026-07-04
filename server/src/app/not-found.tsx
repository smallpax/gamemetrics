import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center">
        <p className="text-5xl font-semibold tracking-tight text-fg">404</p>
        <p className="mt-3 text-sm text-muted">
          That page or project doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/50"
        >
          ← Back to projects
        </Link>
      </main>
    </>
  );
}
