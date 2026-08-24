CREATE TABLE IF NOT EXISTS sync_snapshots (
  sync_key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL
);

