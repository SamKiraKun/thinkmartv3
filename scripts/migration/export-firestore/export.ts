// File: scripts/migration/export-firestore/export.ts
/**
 * Firestore Export Script
 * 
 * Exports all collections from Firestore to JSON files.
 * Each collection is exported to its own file in the ./data/exported/ directory.
 * 
 * Usage:
 *   npm run export                  # Full export
 *   npm run export -- --dry-run     # Count docs only, no export
 *   npm run export -- --collection users  # Export single collection
 * 
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account key
 *   - Or run in an environment with default Firebase credentials
 */

import admin from 'firebase-admin';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data', 'exported');
const BATCH_SIZE = 500; // Firestore batch read limit

// ─── Configuration ──────────────────────────────────────────────────

/** Collections to export with their expected document structure notes */
const COLLECTIONS_TO_EXPORT = [
    'users',
    'wallets',
    'transactions',
    'products',
    'orders',
    'withdrawals',
    'reviews',
    'reviewStats',
    'reviewHelpful',
    'wishlists',
    'tasks',
    'userTaskCompletions',
    'badges',
    'userBadges',
    'settings',
    'categories',
    'brands',
    'banners',
    'coupons',
    'featureFlags',
] as const;

// ─── Firebase Init ──────────────────────────────────────────────────

function initFirebase() {
    if (admin.apps && admin.apps.length > 0) return;

    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
        const serviceAccount = JSON.parse(
            require('fs').readFileSync(credPath, 'utf-8')
        );
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } else {
        admin.initializeApp();
    }
}

// ─── Export Logic ───────────────────────────────────────────────────

interface ExportStats {
    collection: string;
    documentCount: number;
    exportedAt: string;
    durationMs: number;
    errors: string[];
}

/**
 * Export a single Firestore collection to a JSON file.
 * Uses cursor-based pagination for large collections.
 */
async function exportCollection(
    collectionName: string,
    dryRun: boolean
): Promise<ExportStats> {
    const firestore = admin.firestore();
    const stats: ExportStats = {
        collection: collectionName,
        documentCount: 0,
        exportedAt: new Date().toISOString(),
        durationMs: 0,
        errors: [],
    };

    const start = Date.now();

    try {
        const documents: Record<string, any>[] = [];
        let lastDoc: admin.firestore.DocumentSnapshot | null = null;
        let batchCount = 0;

        while (true) {
            let query: admin.firestore.Query = firestore
                .collection(collectionName)
                .limit(BATCH_SIZE);

            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();

            if (snapshot.empty) break;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                documents.push({
                    _id: doc.id,
                    _path: doc.ref.path,
                    _createTime: doc.createTime?.toDate().toISOString(),
                    _updateTime: doc.updateTime?.toDate().toISOString(),
                    ...data,
                });
            }

            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            batchCount++;

            console.log(
                `  [${collectionName}] Batch ${batchCount}: ${snapshot.docs.length} docs (total: ${documents.length})`
            );

            if (snapshot.docs.length < BATCH_SIZE) break;
        }

        stats.documentCount = documents.length;

        if (!dryRun && documents.length > 0) {
            const outputFile = join(DATA_DIR, `${collectionName}.json`);
            writeFileSync(outputFile, JSON.stringify(documents, null, 2), 'utf-8');
            console.log(`  ✅ Exported ${documents.length} docs to ${outputFile}`);
        } else if (dryRun) {
            console.log(`  📊 [DRY RUN] ${collectionName}: ${documents.length} documents`);
        } else {
            console.log(`  ⚠️ ${collectionName}: 0 documents (empty collection)`);
        }
    } catch (err: any) {
        const errorMessage = err.message || String(err);
        stats.errors.push(errorMessage);
        console.error(`  ❌ Error exporting ${collectionName}: ${errorMessage}`);
    }

    stats.durationMs = Date.now() - start;
    return stats;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const singleCollection = args.find((a, i) => args[i - 1] === '--collection');

    console.log('═══════════════════════════════════════════════════════');
    console.log('  ThinkMart Firestore Export Tool');
    console.log(`  Mode: ${dryRun ? 'DRY RUN (count only)' : 'FULL EXPORT'}`);
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Ensure output directory exists
    if (!dryRun) {
        if (!existsSync(DATA_DIR)) {
            mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    initFirebase();

    const collections = singleCollection
        ? [singleCollection]
        : COLLECTIONS_TO_EXPORT;

    const allStats: ExportStats[] = [];

    for (const collection of collections) {
        console.log(`\n📦 Exporting: ${collection}`);
        const stats = await exportCollection(collection, dryRun);
        allStats.push(stats);
    }

    // ─── Summary ────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Export Summary');
    console.log('═══════════════════════════════════════════════════════');

    let totalDocs = 0;
    let totalErrors = 0;

    for (const s of allStats) {
        const status = s.errors.length > 0 ? '❌' : '✅';
        console.log(`  ${status} ${s.collection}: ${s.documentCount} docs (${s.durationMs}ms)`);
        totalDocs += s.documentCount;
        totalErrors += s.errors.length;
    }

    console.log(`\n  Total: ${totalDocs} documents across ${allStats.length} collections`);
    console.log(`  Errors: ${totalErrors}`);

    // Save manifest
    if (!dryRun) {
        const manifest = {
            exportedAt: new Date().toISOString(),
            collections: allStats,
            totalDocuments: totalDocs,
            totalErrors,
        };
        const manifestFile = join(DATA_DIR, '_manifest.json');
        writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8');
        console.log(`\n  📋 Manifest written to ${manifestFile}`);
    }

    if (totalErrors > 0) {
        console.error('\n⚠️  Some collections had errors. Review above and retry.');
        process.exit(1);
    }

    console.log('\n✅ Export complete!\n');
}

main().catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
});
