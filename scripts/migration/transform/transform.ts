// File: scripts/migration/transform/transform.ts
/**
 * Data Transform Script
 * 
 * Reads exported Firestore JSON files and transforms them into
 * SQL-ready format matching the TursoDB schema.
 * 
 * Transformations:
 *   - Firestore Timestamps → ISO 8601 strings
 *   - Nested objects → JSON string columns
 *   - Arrays → JSON string columns
 *   - Null/undefined handling with schema defaults
 *   - Enum normalization
 *   - ID preservation (Firestore doc ID → SQL primary key)
 * 
 * Usage:
 *   npm run transform
 *   npm run transform -- --collection users
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORTED_DIR = join(__dirname, '..', 'data', 'exported');
const TRANSFORMED_DIR = join(__dirname, '..', 'data', 'transformed');

// ─── Timestamp Helpers ──────────────────────────────────────────────

/**
 * Convert a Firestore Timestamp (or various date formats) to ISO 8601 string.
 */
function toISOString(value: any): string | null {
    if (!value) return null;

    // Firestore Timestamp with _seconds and _nanoseconds
    if (value._seconds !== undefined) {
        return new Date(value._seconds * 1000).toISOString();
    }

    // Firestore Timestamp with seconds and nanoseconds
    if (value.seconds !== undefined) {
        return new Date(value.seconds * 1000).toISOString();
    }

    // Already an ISO string
    if (typeof value === 'string') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // JavaScript Date
    if (value instanceof Date) {
        return value.toISOString();
    }

    // Number (epoch ms)
    if (typeof value === 'number') {
        return new Date(value).toISOString();
    }

    return null;
}

/**
 * Safely serialize a value to JSON string, or return null.
 */
function toJSON(value: any): string | null {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
}

// ─── Transform Functions (one per collection) ──────────────────────

interface TransformResult {
    tableName: string;
    rows: Record<string, any>[];
    errors: { docId: string; error: string }[];
}

function transformUsers(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                uid: doc._id || doc.uid,
                email: doc.email || '',
                name: doc.name || doc.displayName || 'Unknown',
                phone: doc.phone || null,
                photo_url: doc.photoURL || doc.photo_url || null,
                role: doc.role || 'user',
                state: doc.state || null,
                city: doc.city || null,
                own_referral_code: doc.ownReferralCode || doc.own_referral_code || nanoid(8).toUpperCase(),
                referral_code: doc.referralCode || doc.referral_code || null,
                referred_by: doc.referredBy || doc.referred_by || null,
                upline_path: toJSON(doc.uplinePath || doc.upline_path || []),
                referral_processed: doc.referralProcessed ? 1 : 0,
                membership_active: doc.membershipActive ? 1 : 0,
                membership_date: toISOString(doc.membershipDate),
                is_active: doc.isActive !== false ? 1 : 0,
                is_banned: doc.isBanned ? 1 : 0,
                kyc_status: doc.kycStatus || 'not_submitted',
                kyc_data: toJSON(doc.kycData),
                kyc_submitted_at: toISOString(doc.kycSubmittedAt),
                kyc_verified_at: toISOString(doc.kycVerifiedAt),
                kyc_rejection_reason: doc.kycRejectionReason || null,
                saved_addresses: toJSON(doc.savedAddresses),
                partner_config: toJSON(doc.partnerConfig),
                vendor_config: toJSON(doc.vendorConfig),
                sub_admin_permissions: toJSON(doc.subAdminPermissions),
                created_at: toISOString(doc.createdAt) || toISOString(doc._createTime) || new Date().toISOString(),
                updated_at: toISOString(doc.updatedAt) || toISOString(doc._updateTime) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'users', rows, errors };
}

function transformWallets(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                user_id: doc._id || doc.userId,
                coin_balance: Number(doc.coinBalance ?? doc.coins ?? 0),
                cash_balance: Number(doc.cashBalance ?? doc.balance ?? 0),
                total_earnings: Number(doc.totalEarnings ?? doc.totalEarned ?? 0),
                total_withdrawals: Number(doc.totalWithdrawals ?? 0),
                updated_at: toISOString(doc.updatedAt) || toISOString(doc.lastUpdated) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'wallets', rows, errors };
}

function transformTransactions(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id || nanoid(21),
                user_id: doc.userId,
                type: doc.type || 'TASK_REWARD',
                amount: Number(doc.amount || 0),
                currency: doc.currency || 'CASH',
                status: doc.status || 'COMPLETED',
                description: doc.description || '',
                related_user_id: doc.relatedUserId || null,
                task_id: doc.taskId || null,
                task_type: doc.taskType || null,
                level: doc.level ?? null,
                source_txn_id: doc.sourceTxnId || null,
                created_at: toISOString(doc.createdAt) || toISOString(doc.timestamp) || toISOString(doc._createTime) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'transactions', rows, errors };
}

function transformProducts(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id,
                name: doc.name || 'Untitled Product',
                description: doc.description || '',
                price: Number(doc.price || 0),
                category: doc.category || '',
                image: doc.image || null,
                images: toJSON(doc.images),
                commission: Number(doc.commission || 0),
                coin_price: doc.coinPrice ?? null,
                in_stock: doc.inStock !== false ? 1 : 0,
                stock: doc.stock ?? null,
                badges: toJSON(doc.badges),
                coin_only: doc.coinOnly ? 1 : 0,
                cash_only: doc.cashOnly ? 1 : 0,
                delivery_days: doc.deliveryDays ?? null,
                vendor: doc.vendor || null,
                created_at: toISOString(doc.createdAt) || toISOString(doc._createTime) || new Date().toISOString(),
                updated_at: toISOString(doc.updatedAt) || toISOString(doc._updateTime) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'products', rows, errors };
}

function transformOrders(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id,
                user_id: doc.userId,
                user_email: doc.userEmail || null,
                user_name: doc.userName || null,
                items: toJSON(doc.items || []),
                subtotal: Number(doc.subtotal || 0),
                cash_paid: Number(doc.cashPaid || 0),
                coins_redeemed: Number(doc.coinsRedeemed || 0),
                coin_value: Number(doc.coinValue || 0),
                shipping_address: toJSON(doc.shippingAddress),
                status: doc.status || 'pending',
                status_history: toJSON(doc.statusHistory || []),
                city: doc.city || null,
                refund_reason: doc.refundReason || null,
                refunded_at: toISOString(doc.refundedAt),
                created_at: toISOString(doc.createdAt) || toISOString(doc._createTime) || new Date().toISOString(),
                updated_at: toISOString(doc.updatedAt) || toISOString(doc._updateTime) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'orders', rows, errors };
}

function transformWithdrawals(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id,
                user_id: doc.userId,
                amount: Number(doc.amount || 0),
                method: doc.method || 'bank',
                status: doc.status || 'pending',
                requested_at: toISOString(doc.requestedAt) || toISOString(doc._createTime) || new Date().toISOString(),
                processed_at: toISOString(doc.processedAt),
                bank_details: toJSON(doc.bankDetails),
                rejection_reason: doc.rejectionReason || null,
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'withdrawals', rows, errors };
}

function transformReviews(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id,
                product_id: doc.productId,
                user_id: doc.userId,
                order_id: doc.orderId || '',
                rating: Number(doc.rating || 1),
                title: doc.title || null,
                content: doc.content || '',
                images: toJSON(doc.images),
                user_name: doc.userName || 'Anonymous',
                user_avatar: doc.userAvatar || null,
                helpful: Number(doc.helpful || 0),
                verified: doc.verified ? 1 : 0,
                status: doc.status || 'pending',
                moderation_note: doc.moderationNote || null,
                created_at: toISOString(doc.createdAt) || toISOString(doc._createTime) || new Date().toISOString(),
                updated_at: toISOString(doc.updatedAt),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'reviews', rows, errors };
}

function transformWishlists(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id,
                user_id: doc.userId,
                product_id: doc.productId,
                product_name: doc.productName || '',
                product_image: doc.productImage || '',
                product_price: Number(doc.productPrice || 0),
                product_coin_price: doc.productCoinPrice ?? null,
                notify_on_price_drop: doc.notifyOnPriceDrop ? 1 : 0,
                notify_on_back_in_stock: doc.notifyOnBackInStock ? 1 : 0,
                added_at: toISOString(doc.addedAt) || toISOString(doc._createTime) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'wishlists', rows, errors };
}

function transformTasks(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            rows.push({
                id: doc._id,
                title: doc.title || '',
                description: doc.description || '',
                type: doc.type || 'SURVEY',
                reward: Number(doc.reward || 0),
                reward_type: doc.rewardType || 'COIN',
                frequency: doc.frequency || 'ONCE',
                min_duration: doc.minDuration ?? null,
                cooldown_hours: doc.cooldownHours ?? null,
                max_completions_per_day: doc.maxCompletionsPerDay ?? null,
                possible_rewards: toJSON(doc.possibleRewards),
                questions: toJSON(doc.questions),
                is_active: doc.isActive !== false ? 1 : 0,
                created_at: toISOString(doc.createdAt) || toISOString(doc._createTime) || new Date().toISOString(),
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'tasks', rows, errors };
}

function transformSettings(docs: any[]): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            // Settings may have arbitrary key-value shape
            // Each document becomes a key with its full value serialized
            rows.push({
                key: doc._id,
                value: JSON.stringify(doc, (key, val) =>
                    key.startsWith('_') ? undefined : val
                ),
                updated_at: toISOString(doc._updateTime) || new Date().toISOString(),
                updated_by: doc.updatedBy || null,
            });
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName: 'settings', rows, errors };
}

/** Generic passthrough for simple collections */
function transformGeneric(docs: any[], tableName: string, fieldMap: Record<string, (doc: any) => any>): TransformResult {
    const rows: Record<string, any>[] = [];
    const errors: { docId: string; error: string }[] = [];

    for (const doc of docs) {
        try {
            const row: Record<string, any> = {};
            for (const [sqlCol, extractor] of Object.entries(fieldMap)) {
                row[sqlCol] = extractor(doc);
            }
            rows.push(row);
        } catch (err: any) {
            errors.push({ docId: doc._id, error: err.message });
        }
    }

    return { tableName, rows, errors };
}

// ─── Collection → Transform mapping ────────────────────────────────

const TRANSFORM_MAP: Record<string, (docs: any[]) => TransformResult> = {
    users: transformUsers,
    wallets: transformWallets,
    transactions: transformTransactions,
    products: transformProducts,
    orders: transformOrders,
    withdrawals: transformWithdrawals,
    reviews: transformReviews,
    wishlists: transformWishlists,
    tasks: transformTasks,
    settings: transformSettings,
    userTaskCompletions: (docs) =>
        transformGeneric(docs, 'user_task_completions', {
            id: (d) => d._id || nanoid(21),
            user_id: (d) => d.userId,
            task_id: (d) => d.taskId,
            completed_at: (d) => toISOString(d.completedAt) || toISOString(d._createTime) || new Date().toISOString(),
            reward: (d) => Number(d.reward || 0),
        }),
    badges: (docs) =>
        transformGeneric(docs, 'badge_definitions', {
            id: (d) => d._id,
            name: (d) => d.name || '',
            description: (d) => d.description || '',
            icon: (d) => d.icon || '',
            category: (d) => d.category || 'special',
            rarity: (d) => d.rarity || 'common',
            criteria_type: (d) => d.criteria?.type || 'manual',
            criteria_threshold: (d) => Number(d.criteria?.threshold || 0),
            coin_reward: (d) => Number(d.coinReward || 0),
            cash_reward: (d) => d.cashReward ?? null,
            sort_order: (d) => Number(d.order || 0),
            is_hidden: (d) => d.isHidden ? 1 : 0,
            is_active: (d) => d.isActive !== false ? 1 : 0,
        }),
    userBadges: (docs) =>
        transformGeneric(docs, 'user_badges', {
            id: (d) => d._id,
            badge_id: (d) => d.badgeId,
            user_id: (d) => d.userId,
            badge_name: (d) => d.badgeName || '',
            badge_icon: (d) => d.badgeIcon || '',
            badge_rarity: (d) => d.badgeRarity || 'common',
            earned_at: (d) => toISOString(d.earnedAt) || toISOString(d._createTime) || new Date().toISOString(),
            progress: (d) => d.progress ?? null,
            rewards_claimed: (d) => d.rewardsClaimed ? 1 : 0,
            claimed_at: (d) => toISOString(d.claimedAt),
        }),
    reviewStats: (docs) =>
        transformGeneric(docs, 'review_stats', {
            product_id: (d) => d._id || d.productId,
            total_reviews: (d) => Number(d.totalReviews || 0),
            average_rating: (d) => Number(d.averageRating || 0),
            rating_distribution: (d) => toJSON(d.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }),
            last_updated: (d) => toISOString(d.lastUpdated) || new Date().toISOString(),
        }),
    reviewHelpful: (docs) =>
        transformGeneric(docs, 'review_helpful', {
            review_id: (d) => d.reviewId || d._id?.split('_')[0] || '',
            user_id: (d) => d.userId || d._id?.split('_')[1] || '',
            helpful: (d) => d.helpful !== false ? 1 : 0,
            created_at: (d) => toISOString(d.createdAt) || toISOString(d._createTime) || new Date().toISOString(),
        }),
    categories: (docs) =>
        transformGeneric(docs, 'categories', {
            id: (d) => d._id,
            name: (d) => d.name || '',
            slug: (d) => d.slug || d._id,
            image: (d) => d.image || null,
            sort_order: (d) => Number(d.sortOrder || d.order || 0),
            is_active: (d) => d.isActive !== false ? 1 : 0,
            parent_id: (d) => d.parentId || null,
            created_at: (d) => toISOString(d.createdAt) || toISOString(d._createTime) || new Date().toISOString(),
        }),
    brands: (docs) =>
        transformGeneric(docs, 'brands', {
            id: (d) => d._id,
            name: (d) => d.name || '',
            slug: (d) => d.slug || d._id,
            logo: (d) => d.logo || null,
            is_active: (d) => d.isActive !== false ? 1 : 0,
            created_at: (d) => toISOString(d.createdAt) || toISOString(d._createTime) || new Date().toISOString(),
        }),
    banners: (docs) =>
        transformGeneric(docs, 'banners', {
            id: (d) => d._id,
            title: (d) => d.title || null,
            image: (d) => d.image || '',
            link: (d) => d.link || null,
            sort_order: (d) => Number(d.sortOrder || d.order || 0),
            is_active: (d) => d.isActive !== false ? 1 : 0,
            start_date: (d) => toISOString(d.startDate),
            end_date: (d) => toISOString(d.endDate),
            created_at: (d) => toISOString(d.createdAt) || toISOString(d._createTime) || new Date().toISOString(),
        }),
    coupons: (docs) =>
        transformGeneric(docs, 'coupons', {
            id: (d) => d._id,
            code: (d) => d.code || d._id,
            description: (d) => d.description || null,
            discount_type: (d) => d.discountType || 'percentage',
            discount_value: (d) => Number(d.discountValue || 0),
            min_order_amount: (d) => d.minOrderAmount ?? null,
            max_discount: (d) => d.maxDiscount ?? null,
            usage_limit: (d) => d.usageLimit ?? null,
            used_count: (d) => Number(d.usedCount || 0),
            is_active: (d) => d.isActive !== false ? 1 : 0,
            start_date: (d) => toISOString(d.startDate),
            end_date: (d) => toISOString(d.endDate),
            created_at: (d) => toISOString(d.createdAt) || toISOString(d._createTime) || new Date().toISOString(),
        }),
};

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const singleCollection = args.find((a, i) => args[i - 1] === '--collection');

    console.log('═══════════════════════════════════════════════════════');
    console.log('  ThinkMart Data Transform Tool');
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (!existsSync(EXPORTED_DIR)) {
        console.error(`❌ Exported data directory not found: ${EXPORTED_DIR}`);
        console.error('   Run the export script first: npm run export');
        process.exit(1);
    }

    if (!existsSync(TRANSFORMED_DIR)) {
        mkdirSync(TRANSFORMED_DIR, { recursive: true });
    }

    const collections = singleCollection
        ? [singleCollection]
        : Object.keys(TRANSFORM_MAP);

    let totalRows = 0;
    let totalErrors = 0;

    for (const collection of collections) {
        const transformer = TRANSFORM_MAP[collection];
        if (!transformer) {
            console.log(`⚠️  No transformer for collection: ${collection} (skipping)`);
            continue;
        }

        const inputFile = join(EXPORTED_DIR, `${collection}.json`);
        if (!existsSync(inputFile)) {
            console.log(`⚠️  No export file found: ${inputFile} (skipping)`);
            continue;
        }

        console.log(`🔄 Transforming: ${collection}`);
        const docs = JSON.parse(readFileSync(inputFile, 'utf-8'));
        const result = transformer(docs);

        // Write transformed data
        const outputFile = join(TRANSFORMED_DIR, `${result.tableName}.json`);
        writeFileSync(outputFile, JSON.stringify(result.rows, null, 2), 'utf-8');

        totalRows += result.rows.length;
        totalErrors += result.errors.length;

        const status = result.errors.length > 0 ? '⚠️' : '✅';
        console.log(`  ${status} ${collection} → ${result.tableName}: ${result.rows.length} rows, ${result.errors.length} errors`);

        // Log errors
        if (result.errors.length > 0) {
            const errFile = join(TRANSFORMED_DIR, `${result.tableName}_errors.json`);
            writeFileSync(errFile, JSON.stringify(result.errors, null, 2), 'utf-8');
            console.log(`     Error details written to ${errFile}`);
        }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  Transform Complete: ${totalRows} rows, ${totalErrors} errors`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (totalErrors > 0) {
        console.warn('⚠️  Some documents had transform errors. Review _errors.json files.');
    }
}

main().catch((err) => {
    console.error('Transform failed:', err);
    process.exit(1);
});
