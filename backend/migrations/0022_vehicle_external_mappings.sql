CREATE TABLE IF NOT EXISTS vehicle_external_mappings (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_name TEXT,
  external_address TEXT,
  external_protocol TEXT,
  sync_status TEXT NOT NULL DEFAULT 'linked',
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_external_mappings_vehicle
  ON vehicle_external_mappings(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_external_mappings_provider_vehicle
  ON vehicle_external_mappings(provider, vehicle_id);
