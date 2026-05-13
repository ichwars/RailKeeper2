ALTER TABLE users ADD COLUMN email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  handled_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_created_at
  ON password_reset_requests(created_at);
