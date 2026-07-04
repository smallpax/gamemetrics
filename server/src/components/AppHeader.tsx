import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

/** Global top bar. Breadcrumb segments render after the wordmark. */
export function AppHeader({
  crumbs = [],
  user,
}: {
  crumbs?: { label: string; href?: string }[];
  user?: { email: string };
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-base/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight text-fg">
            GameMetrics
          </span>
        </Link>
        {crumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-line">/</span>
            {c.href ? (
              <Link
                href={c.href}
                className="text-sm text-muted transition-colors hover:text-fg"
              >
                {c.label}
              </Link>
            ) : (
              <span className="max-w-[16rem] truncate text-sm text-fg">
                {c.label}
              </span>
            )}
          </div>
        ))}
        {user && (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-2 text-base shadow-sm">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V11M10 19V5M16 19v-6M20 19H3" />
      </svg>
    </span>
  );
}
