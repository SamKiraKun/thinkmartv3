-- Add organization configuration JSON blob for organization dashboard/admin management
ALTER TABLE users ADD COLUMN org_config TEXT;

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('006_org_config_column');
