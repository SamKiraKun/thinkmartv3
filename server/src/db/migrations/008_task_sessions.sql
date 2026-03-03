-- File: server/src/db/migrations/008_task_sessions.sql
-- Adds persistent task_sessions table used by task start/complete flows.

CREATE TABLE IF NOT EXISTS task_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  payload TEXT,
  FOREIGN KEY (user_id) REFERENCES users(uid),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_user_task ON task_sessions(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_status ON task_sessions(status);
CREATE INDEX IF NOT EXISTS idx_task_sessions_started_at ON task_sessions(started_at DESC);
