-- File: server/src/db/migrations/004_product_moderation_columns.sql
-- Adds product moderation fields required for admin review workflows.

ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE products ADD COLUMN moderation_reason TEXT;
ALTER TABLE products ADD COLUMN moderated_at TEXT;
ALTER TABLE products ADD COLUMN moderated_by TEXT;

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
