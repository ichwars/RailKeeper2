CREATE TABLE IF NOT EXISTS inventory_number_schemes (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  padding INTEGER NOT NULL DEFAULT 6,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_number_history (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  old_number TEXT,
  new_number TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

INSERT INTO inventory_number_schemes(id, category, prefix, next_number, padding, active, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'Fahrzeug', 'RK-FAH', 1, 6, 1, datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Lokomotive', 'RK-LOK', 1, 6, 1, datetime('now'), datetime('now')),
  (lower(hex(randomblob(16))), 'Wagen', 'RK-WAG', 1, 6, 1, datetime('now'), datetime('now'))
ON CONFLICT(category) DO NOTHING;
