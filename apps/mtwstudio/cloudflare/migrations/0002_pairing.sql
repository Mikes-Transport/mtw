ALTER TABLE hosts ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'code' CHECK(connection_mode IN ('code','paired'));
CREATE TABLE IF NOT EXISTS trusted_controllers(
  host_id TEXT NOT NULL REFERENCES hosts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(host_id,user_id)
);
