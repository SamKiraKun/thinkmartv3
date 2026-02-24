CREATE TABLE IF NOT EXISTS user_action_cooldowns (
  user_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  last_executed_at TEXT,
  available_at TEXT,
  state_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, action_key),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS idx_user_action_cooldowns_user ON user_action_cooldowns(user_id);
CREATE INDEX IF NOT EXISTS idx_user_action_cooldowns_action ON user_action_cooldowns(action_key);
CREATE INDEX IF NOT EXISTS idx_user_action_cooldowns_available_at ON user_action_cooldowns(available_at);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('007_user_action_cooldowns');
