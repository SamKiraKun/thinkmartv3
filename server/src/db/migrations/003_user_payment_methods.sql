-- Add structured payment methods storage to users for Firebase->Turso migration
ALTER TABLE users ADD COLUMN payment_methods TEXT;
