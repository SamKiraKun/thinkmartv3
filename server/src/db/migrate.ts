// File: server/src/db/migrate.ts
/**
 * Database migration runner.
 * Reads SQL files from migrations/ directory and applies them in order.
 * Tracks applied migrations in the schema_migrations table.
 * 
 * Usage:
 *   npm run db:migrate          # Apply pending migrations
 *   npm run db:migrate --status # Show migration status
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './client.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable() {
    const db = getDb();
    await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
    const db = getDb();
    const result = await db.execute('SELECT version FROM schema_migrations ORDER BY version');
    return new Set(result.rows.map((row) => row.version as string));
}

function getPendingMigrations(applied: Set<string>): string[] {
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    return files.filter((f) => {
        const version = f.replace('.sql', '');
        return !applied.has(version);
    });
}

/**
 * Split SQL file into individual statements.
 * Handles parentheses depth so semicolons inside CREATE TABLE, CHECK, etc. don't cause a split.
 * Strips comments (lines starting with --).
 */
function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let depth = 0;
    let inSingleQuote = false;

    // Remove full-line comments first
    const lines = sql.split('\n');
    const cleaned = lines
        .map((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('--')) return '';
            // Remove inline comments (-- after SQL)
            // But be careful not to strip inside strings
            return line;
        })
        .join('\n');

    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];

        // Handle single-quoted strings
        if (ch === "'" && (i === 0 || cleaned[i - 1] !== '\\')) {
            inSingleQuote = !inSingleQuote;
            current += ch;
            continue;
        }

        if (inSingleQuote) {
            current += ch;
            continue;
        }

        // Handle inline comments
        if (ch === '-' && cleaned[i + 1] === '-') {
            // Skip to end of line
            const nlIndex = cleaned.indexOf('\n', i);
            if (nlIndex === -1) break;
            i = nlIndex;
            current += ' ';
            continue;
        }

        if (ch === '(') {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ';' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed.length > 0) {
                statements.push(trimmed);
            }
            current = '';
        } else {
            current += ch;
        }
    }

    // Handle last statement without trailing semicolon
    const lastTrimmed = current.trim();
    if (lastTrimmed.length > 0) {
        statements.push(lastTrimmed);
    }

    return statements;
}

async function applyMigration(filename: string) {
    const db = getDb();
    const filepath = join(MIGRATIONS_DIR, filename);
    const sql = readFileSync(filepath, 'utf-8');
    const version = filename.replace('.sql', '');

    logger.info({ version }, 'Applying migration...');

    const statements = splitSqlStatements(sql);

    for (const stmt of statements) {
        try {
            await db.execute(stmt);
        } catch (err) {
            logger.error({ version, statement: stmt.substring(0, 200), err }, 'Migration statement failed');
            throw err;
        }
    }

    await db.execute({
        sql: `INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`,
        args: [version],
    });

    logger.info({ version }, 'Migration applied successfully');
}

async function showStatus() {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    console.log('\n📋 Migration Status:');
    console.log('─'.repeat(60));

    for (const file of files) {
        const version = file.replace('.sql', '');
        const status = applied.has(version) ? '✅ Applied' : '⏳ Pending';
        console.log(`  ${status}  ${version}`);
    }

    console.log('─'.repeat(60));
    console.log(`  Total: ${files.length} | Applied: ${applied.size} | Pending: ${files.length - applied.size}\n`);
}

async function migrate() {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const pending = getPendingMigrations(applied);

    if (pending.length === 0) {
        logger.info('No pending migrations');
        return;
    }

    logger.info({ count: pending.length }, 'Pending migrations found');

    for (const file of pending) {
        await applyMigration(file);
    }

    logger.info('All migrations applied successfully ✅');
}

// CLI entry point
const args = process.argv.slice(2);

if (args.includes('--status')) {
    showStatus().catch((err) => {
        console.error('Failed to get migration status:', err);
        process.exit(1);
    });
} else {
    migrate().catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
