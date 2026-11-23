CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  agent_key_hash TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS access_codes (
  code_hash TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  controller_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL REFERENCES access_codes(code_hash),
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','ended')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_connections_controller ON connections(controller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_host ON connections(host_id, created_at DESC);
