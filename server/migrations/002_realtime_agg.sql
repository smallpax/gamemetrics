-- Enable real-time aggregation on the hourly continuous aggregate.
--
-- The aggregate is materialized on a schedule (policy: end_offset 1h, refreshed
-- hourly), so by default (materialized_only = true) a query against the view
-- silently omits any data newer than the last materialization — up to ~1h+ of
-- recent events. The read API (/v1/metrics/timeseries) reads this view for the
-- unfiltered fast path, so it must not lag.
--
-- With real-time aggregation the view transparently UNIONs the materialized
-- buckets with an on-the-fly aggregation of the raw tail, giving both speed and
-- freshness.
ALTER MATERIALIZED VIEW event_counts_hourly
  SET (timescaledb.materialized_only = false);
