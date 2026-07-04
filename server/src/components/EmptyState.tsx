export function EmptyState({
  title = "No data yet",
  message,
  icon,
}: {
  title?: string;
  message: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="mb-1 text-faint">{icon ?? <BarsIcon />}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="max-w-xs text-sm text-muted">{message}</p>
    </div>
  );
}

function BarsIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
