-- File: server/src/db/migrations/005_tasks_admin_metadata.sql
-- Adds task admin metadata and generic config storage for task-specific fields.

ALTER TABLE tasks ADD COLUMN config TEXT;
ALTER TABLE tasks ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(is_archived);
CREATE INDEX IF NOT EXISTS idx_tasks_active_archived ON tasks(is_active, is_archived);
