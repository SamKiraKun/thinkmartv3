// File: scripts/migration/validate/validate.ts
/**
 * Migration Validation Script
 * 
 * Verifies data parity between the Firestore export and TursoDB import.
 * Checks:
 *   1. Row counts match per table
 *   2. Critical field integrity (users, wallets, transactions)
 *   3. Financial balance reconciliation
 *   4. Referential integrity (FK relationships)
 * 
 * Usage:
 *   npm run validate
 *   npm run validate -- --verbose
 *   npm run validate -- --table users
 */

import { createClient, type Client } from '@libsql/client';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORTED_DIR = join(__dirname, '..', 'data', 'exported');
const TRANSFORMED_DIR = join(__dirname, '..', 'data', 'transformed');

// ─── Types ──────────────────────────────────────────────────────────

interface ValidationCheck {
    name: string;
    status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
    message: string;
    details?: any;
}

// ─── Database Connection ────────────────────────────────────────────

function createDbClient(): Client {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
        console.error('❌ TURSO_DATABASE_URL not set');
        process.exit(1);
    }

    return createClient({
        url,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
}

// ─── Validation Checks ─────────────────────────────────────────────

/**
 * Check 1: Row count comparison per table
 */
async function checkRowCounts(db: Client, verbose: boolean): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    const tableToFile: Record<string, string> = {
        users: 'users',
        wallets: 'wallets',
        transactions: 'transactions',
        products: 'products',
        orders: 'orders',
        withdrawals: 'withdrawals',
        reviews: 'reviews',
        review_stats: 'reviewStats',
        wishlists: 'wishlists',
        tasks: 'tasks',
        user_task_completions: 'userTaskCompletions',
        badge_definitions: 'badges',
        user_badges: 'userBadges',
        settings: 'settings',
        categories: 'categories',
        brands: 'brands',
        banners: 'banners',
        coupons: 'coupons',
    };

    for (const [table, firestoreCollection] of Object.entries(tableToFile)) {
        const exportFile = join(EXPORTED_DIR, `${firestoreCollection}.json`);

        if (!existsSync(exportFile)) {
            checks.push({
                name: `Row count: ${table}`,
                status: 'SKIP',
                message: 'No export file found',
            });
            continue;
        }

        const exportedDocs = JSON.parse(readFileSync(exportFile, 'utf-8'));
        const exportedCount = exportedDocs.length;

        try {
            const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
            const dbCount = Number(result.rows[0].count);

            const match = dbCount >= exportedCount; // >= because INSERT OR IGNORE may skip dupes

            checks.push({
                name: `Row count: ${table}`,
                status: match ? 'PASS' : 'FAIL',
                message: `Firestore: ${exportedCount}, TursoDB: ${dbCount}`,
                details: verbose ? { exportedCount, dbCount, delta: dbCount - exportedCount } : undefined,
            });
        } catch (err: any) {
            checks.push({
                name: `Row count: ${table}`,
                status: 'FAIL',
                message: `Query failed: ${err.message}`,
            });
        }
    }

    return checks;
}

/**
 * Check 2: Critical user field integrity
 */
async function checkUserIntegrity(db: Client): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    // Check for users without email
    const noEmail = await db.execute(
        `SELECT COUNT(*) as count FROM users WHERE email IS NULL OR email = ''`
    );
    checks.push({
        name: 'Users: email required',
        status: Number(noEmail.rows[0].count) === 0 ? 'PASS' : 'FAIL',
        message: `${noEmail.rows[0].count} users without email`,
    });

    // Check for users without referral code
    const noRefCode = await db.execute(
        `SELECT COUNT(*) as count FROM users WHERE own_referral_code IS NULL OR own_referral_code = ''`
    );
    checks.push({
        name: 'Users: referral code required',
        status: Number(noRefCode.rows[0].count) === 0 ? 'PASS' : 'FAIL',
        message: `${noRefCode.rows[0].count} users without referral code`,
    });

    // Check for duplicate referral codes
    const dupeRefCodes = await db.execute(
        `SELECT own_referral_code, COUNT(*) as count FROM users GROUP BY own_referral_code HAVING count > 1`
    );
    checks.push({
        name: 'Users: unique referral codes',
        status: dupeRefCodes.rows.length === 0 ? 'PASS' : 'FAIL',
        message: `${dupeRefCodes.rows.length} duplicate referral codes`,
    });

    // Check valid roles
    const invalidRoles = await db.execute(
        `SELECT COUNT(*) as count FROM users WHERE role NOT IN ('user', 'admin', 'sub_admin', 'vendor', 'partner', 'organization')`
    );
    checks.push({
        name: 'Users: valid roles',
        status: Number(invalidRoles.rows[0].count) === 0 ? 'PASS' : 'WARN',
        message: `${invalidRoles.rows[0].count} users with invalid role`,
    });

    return checks;
}

/**
 * Check 3: Financial balance reconciliation
 */
async function checkFinancialIntegrity(db: Client): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    // Every user should have a wallet
    const usersWithoutWallet = await db.execute(
        `SELECT COUNT(*) as count FROM users u LEFT JOIN wallets w ON u.uid = w.user_id WHERE w.user_id IS NULL`
    );
    checks.push({
        name: 'Wallets: every user has one',
        status: Number(usersWithoutWallet.rows[0].count) === 0 ? 'PASS' : 'WARN',
        message: `${usersWithoutWallet.rows[0].count} users without wallet`,
    });

    // No negative balances
    const negativeBal = await db.execute(
        `SELECT COUNT(*) as count FROM wallets WHERE coin_balance < 0 OR cash_balance < 0`
    );
    checks.push({
        name: 'Wallets: no negative balances',
        status: Number(negativeBal.rows[0].count) === 0 ? 'PASS' : 'FAIL',
        message: `${negativeBal.rows[0].count} wallets with negative balance`,
    });

    // Total earnings should be >= total withdrawals
    const badEarnings = await db.execute(
        `SELECT COUNT(*) as count FROM wallets WHERE total_earnings < total_withdrawals`
    );
    checks.push({
        name: 'Wallets: earnings >= withdrawals',
        status: Number(badEarnings.rows[0].count) === 0 ? 'PASS' : 'WARN',
        message: `${badEarnings.rows[0].count} wallets where earnings < withdrawals`,
    });

    // Transaction amounts should be positive
    const negativeAmounts = await db.execute(
        `SELECT COUNT(*) as count FROM transactions WHERE amount < 0`
    );
    checks.push({
        name: 'Transactions: positive amounts',
        status: Number(negativeAmounts.rows[0].count) === 0 ? 'PASS' : 'WARN',
        message: `${negativeAmounts.rows[0].count} transactions with negative amount`,
    });

    return checks;
}

/**
 * Check 4: Referential integrity
 */
async function checkReferentialIntegrity(db: Client): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    const fkChecks = [
        { name: 'Transactions → Users', sql: `SELECT COUNT(*) as count FROM transactions t LEFT JOIN users u ON t.user_id = u.uid WHERE u.uid IS NULL` },
        { name: 'Orders → Users', sql: `SELECT COUNT(*) as count FROM orders o LEFT JOIN users u ON o.user_id = u.uid WHERE u.uid IS NULL` },
        { name: 'Withdrawals → Users', sql: `SELECT COUNT(*) as count FROM withdrawals w LEFT JOIN users u ON w.user_id = u.uid WHERE u.uid IS NULL` },
        { name: 'Reviews → Users', sql: `SELECT COUNT(*) as count FROM reviews r LEFT JOIN users u ON r.user_id = u.uid WHERE u.uid IS NULL` },
        { name: 'Wishlists → Users', sql: `SELECT COUNT(*) as count FROM wishlists w LEFT JOIN users u ON w.user_id = u.uid WHERE u.uid IS NULL` },
        { name: 'Reviews → Products', sql: `SELECT COUNT(*) as count FROM reviews r LEFT JOIN products p ON r.product_id = p.id WHERE p.id IS NULL` },
        { name: 'Wishlists → Products', sql: `SELECT COUNT(*) as count FROM wishlists w LEFT JOIN products p ON w.product_id = p.id WHERE p.id IS NULL` },
    ];

    for (const check of fkChecks) {
        try {
            const result = await db.execute(check.sql);
            const orphanCount = Number(result.rows[0].count);
            checks.push({
                name: `FK: ${check.name}`,
                status: orphanCount === 0 ? 'PASS' : 'WARN',
                message: `${orphanCount} orphan records`,
            });
        } catch (err: any) {
            checks.push({
                name: `FK: ${check.name}`,
                status: 'FAIL',
                message: `Query failed: ${err.message}`,
            });
        }
    }

    return checks;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const verbose = args.includes('--verbose');

    console.log('═══════════════════════════════════════════════════════');
    console.log('  ThinkMart Migration Validation');
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════\n');

    const db = createDbClient();
    console.log('📡 Connected to TursoDB\n');

    const allChecks: ValidationCheck[] = [];

    // 1. Row counts
    console.log('📊 Checking row counts...');
    allChecks.push(...await checkRowCounts(db, verbose));

    // 2. User integrity
    console.log('👤 Checking user integrity...');
    allChecks.push(...await checkUserIntegrity(db));

    // 3. Financial integrity
    console.log('💰 Checking financial integrity...');
    allChecks.push(...await checkFinancialIntegrity(db));

    // 4. Referential integrity
    console.log('🔗 Checking referential integrity...\n');
    allChecks.push(...await checkReferentialIntegrity(db));

    // ─── Report ─────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Validation Report');
    console.log('═══════════════════════════════════════════════════════\n');

    const statusIcon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭️' };
    let pass = 0, fail = 0, warn = 0, skip = 0;

    for (const check of allChecks) {
        console.log(`  ${statusIcon[check.status]} ${check.name}: ${check.message}`);
        if (verbose && check.details) {
            console.log(`     Details: ${JSON.stringify(check.details)}`);
        }

        switch (check.status) {
            case 'PASS': pass++; break;
            case 'FAIL': fail++; break;
            case 'WARN': warn++; break;
            case 'SKIP': skip++; break;
        }
    }

    console.log('\n───────────────────────────────────────────────────────');
    console.log(`  Total: ${allChecks.length} checks`);
    console.log(`  ✅ Pass: ${pass}  ❌ Fail: ${fail}  ⚠️  Warn: ${warn}  ⏭️  Skip: ${skip}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (fail > 0) {
        console.error('❌ Validation FAILED — resolve failures before cutover.');
        process.exit(1);
    }

    if (warn > 0) {
        console.warn('⚠️  Validation PASSED with warnings — review before cutover.');
        process.exit(0);
    }

    console.log('✅ Validation PASSED — all checks clean.\n');
}

main().catch((err) => {
    console.error('Validation failed:', err);
    process.exit(1);
});
