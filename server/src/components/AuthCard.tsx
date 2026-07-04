import Link from "next/link";

/** Centered card shell shared by the login and signup pages. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-2 text-base shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V11M10 19V5M16 19v-6M20 19H3" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight text-fg">
            GameMetrics
          </span>
        </Link>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight text-fg">
            {title}
          </h1>
          <p className="mt-1 mb-5 text-sm text-muted">{subtitle}</p>
          {children}
        </div>

        <p className="mt-5 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  );
}
