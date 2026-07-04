CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  key TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(24), 'hex'),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);

CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  event_name TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  params JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name, timestamp DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS event_counts_hourly
WITH (timescaledb.continuous) AS
SELECT
  project_id,
  time_bucket('1 hour', timestamp) AS bucket,
  count(*) AS event_count
FROM events
GROUP BY project_id, bucket;

SELECT add_continuous_aggregate_policy('event_counts_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);
