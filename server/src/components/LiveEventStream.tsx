"use client";

import { useState } from "react";
import { useEventStream } from "@/lib/useEventStream";
import type { RecentEvent } from "@/lib/portal";
import { EmptyState } from "@/components/EmptyState";

/**
 * Live, auto-updating event feed. Polls the portal's /live/recent route (see
 * useEventStream — the transport is fully encapsulated there). Newest events
 * appear at the top, freshly-arrived rows flash, and params are expandable.
 */
export function LiveEventStream({ pollUrl }: { pollUrl: string }) {
  const { events, newIds, live, error, toggle } = useEventStream(pollUrl);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
        <div className="flex items-center gap-3">
          <LiveIndicator live={live} />
          <span className="text-xs text-muted">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-fg"
          aria-pressed={!live}
        >
          {live ? <PauseIcon /> : <PlayIcon />}
          <span>{live ? "Pause" : "Resume"}</span>
        </button>
      </div>

      {error && (
        <div className="border-b border-line-soft px-5 py-2 text-xs text-warning">
          {error} — retrying…
        </div>
      )}

      {events.length === 0 ? (
        <EmptyState
          title={live ? "Waiting for events…" : "Paused"}
          message={
            live
              ? "Send an event and it will appear here within a couple of seconds."
              : "Resume to start streaming events again."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-2.5 font-medium">Time</th>
                <th className="px-5 py-2.5 font-medium">Event</th>
                <th className="px-5 py-2.5 font-medium">User</th>
                <th className="px-5 py-2.5 text-right font-medium">Params</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {events.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  highlight={newIds.has(e.id)}
                  open={expanded.has(e.id)}
                  onToggle={() => toggleRow(e.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventRow({
  event,
  highlight,
  open,
  onToggle,
}: {
  event: RecentEvent;
  highlight: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const hasParams = event.params && Object.keys(event.params).length > 0;

  return (
    <>
      <tr
        className={`group cursor-pointer transition-colors hover:bg-surface-2/40 ${
          highlight ? "animate-[flash_1.6s_ease-out]" : ""
        }`}
        onClick={onToggle}
      >
        <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs tabular-nums text-muted">
          {formatTime(event.timestamp)}
        </td>
        <td className="px-5 py-2.5">
          <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-medium text-accent">
            {event.event_name}
          </span>
        </td>
        <td className="px-5 py-2.5 font-mono text-xs text-muted">
          {event.user_id ?? <span className="text-faint">anon</span>}
        </td>
        <td className="px-5 py-2.5 text-right">
          {hasParams ? (
            <span className="inline-flex items-center gap-1 text-xs text-faint transition-colors group-hover:text-muted">
              {Object.keys(event.params).length} field
              {Object.keys(event.params).length === 1 ? "" : "s"}
              <Chevron open={open} />
            </span>
          ) : (
            <span className="text-xs text-faint">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-base/40">
          <td colSpan={4} className="px-5 py-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-faint">session</dt>
              <dd className="font-mono text-muted">
                {event.session_id ?? "—"}
              </dd>
              <dt className="text-faint">params</dt>
              <dd>
                <pre className="overflow-x-auto rounded-md bg-base px-3 py-2 font-mono text-xs text-fg">
                  {JSON.stringify(event.params, null, 2)}
                </pre>
              </dd>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function LiveIndicator({ live }: { live: boolean }) {
  if (!live) {
    return (
      <span className="inline-flex items-center gap-2 text-xs font-medium text-faint">
        <span className="h-2 w-2 rounded-full bg-faint" />
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-positive">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
      </span>
      Live
    </span>
  );
}

/** Wall-clock time with seconds — what you want when watching taps arrive. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
