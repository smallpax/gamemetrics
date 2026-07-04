"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecentEvent } from "@/lib/portal";

/**
 * Transport hook for the live event stream.
 *
 * It owns the polling transport entirely: cursor tracking (`since`), de-duping
 * by event id, capping the in-memory list, and flagging freshly-arrived ids so
 * the UI can highlight them. The component that consumes this only renders the
 * returned state — it knows nothing about polling.
 *
 * This is the SSE seam: a `useEventStream` backed by an EventSource could expose
 * the exact same shape ({ events, newIds, live, error, toggle }) and the UI
 * would not change.
 */

const MAX_EVENTS = 200;
const HIGHLIGHT_MS = 1600;

export interface EventStream {
  events: RecentEvent[];
  /** Ids that arrived in the latest poll — used for the brief row highlight. */
  newIds: ReadonlySet<string>;
  live: boolean;
  error: string | null;
  toggle: () => void;
}

export function useEventStream(
  pollUrl: string,
  intervalMs = 2500,
): EventStream {
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [live, setLive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs survive re-renders without re-triggering the polling effect.
  const sinceRef = useRef<string | undefined>(undefined);
  const seenRef = useRef<Set<string>>(new Set());
  const initialRef = useRef(true);
  const highlightTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const poll = useCallback(async (signal: AbortSignal) => {
    const url = new URL(pollUrl, window.location.origin);
    if (sinceRef.current) url.searchParams.set("since", sinceRef.current);

    let data: { events: RecentEvent[] };
    try {
      const res = await fetch(url.toString(), { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`Stream responded ${res.status}`);
      data = await res.json();
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load events");
      return;
    }

    setError(null);

    // Server returns newest-first. Keep only ids we haven't seen.
    const incoming = data.events ?? [];
    const fresh = incoming.filter((e) => !seenRef.current.has(e.id));

    // Advance the cursor past the newest event we've observed, even if it was a
    // duplicate, so `since` always moves forward.
    if (incoming.length > 0) {
      const newest = incoming[0].timestamp; // newest-first
      if (!sinceRef.current || Date.parse(newest) > Date.parse(sinceRef.current)) {
        sinceRef.current = newest;
      }
    }

    if (fresh.length === 0) {
      initialRef.current = false;
      return;
    }

    for (const e of fresh) seenRef.current.add(e.id);
    setEvents((prev) => [...fresh, ...prev].slice(0, MAX_EVENTS));

    // Don't flash the initial backfill — only genuinely new arrivals.
    if (!initialRef.current) {
      const ids = fresh.map((e) => e.id);
      setNewIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      const timer = setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      }, HIGHLIGHT_MS);
      highlightTimers.current.push(timer);
    }
    initialRef.current = false;
  }, [pollUrl]);

  useEffect(() => {
    if (!live) return;

    const controller = new AbortController();
    // Poll immediately, then on an interval.
    poll(controller.signal);
    const id = setInterval(() => poll(controller.signal), intervalMs);

    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [live, intervalMs, poll]);

  // Clear any pending highlight timers on unmount.
  useEffect(() => {
    const timers = highlightTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const toggle = useCallback(() => setLive((v) => !v), []);

  return { events, newIds, live, error, toggle };
}
