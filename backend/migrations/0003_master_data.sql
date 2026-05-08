CREATE TABLE IF NOT EXISTS master_data_entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (type, key)
);

CREATE INDEX IF NOT EXISTS idx_master_data_entries_type ON master_data_entries(type, active, sort_order, label);

CREATE TABLE IF NOT EXISTS master_data_relations (
  id TEXT PRIMARY KEY,
  parent_type TEXT NOT NULL,
  parent_key TEXT NOT NULL,
  child_type TEXT NOT NULL,
  child_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (parent_type, parent_key, child_type, child_key)
);

CREATE INDEX IF NOT EXISTS idx_master_data_relations_parent ON master_data_relations(parent_type, parent_key, child_type, sort_order);
