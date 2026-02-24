// File: functions/src/search/productSearch.ts
/**
 * Product Search Cloud Functions
 * 
 * Handles product indexing to Typesense search engine.
 * Typesense is a fast, typo-tolerant open-source search engine.
 * 
 * Setup:
 * 1. Create a Typesense Cloud account or self-host
 * 2. Set environment variables in Firebase Functions config
 * 3. Deploy these functions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Typesense from 'typesense';

const db = admin.firestore();

// ============================================================================
// TYPESENSE CLIENT SETUP
// ============================================================================

function getTypesenseClient() {
    const config = functions.config().typesense;

    if (!config?.host || !config?.api_key) {
        functions.logger.warn('Typesense not configured. Set firebase functions:config:set typesense.host=xxx typesense.api_key=xxx');
        return null;
    }

    return new Typesense.Client({
        nodes: [{
            host: config.host,
            port: parseInt(config.port || '443'),
            protocol: config.protocol || 'https',
        }],
        apiKey: config.api_key,
        connectionTimeoutSeconds: 10,
    });
}

// ============================================================================
// COLLECTION SCHEMA
// ============================================================================

const PRODUCT_SCHEMA = {
    name: 'products',
    fields: [
        { name: 'id', type: 'string' as const },
        { name: 'name', type: 'string' as const },
        { name: 'description', type: 'string' as const },
        { name: 'price', type: 'float' as const },
        { name: 'coinPrice', type: 'int32' as const, optional: true },
        { name: 'category', type: 'string' as const, facet: true },
        { name: 'brand', type: 'string' as const, facet: true, optional: true },
        { name: 'tags', type: 'string[]' as const },
        { name: 'image', type: 'string' as const },
        { name: 'inStock', type: 'bool' as const, facet: true },
        { name: 'rating', type: 'float' as const },
        { name: 'reviewCount', type: 'int32' as const },
        { name: 'vendor', type: 'string' as const, optional: true },
        { name: 'createdAt', type: 'int64' as const },
    ],
    default_sorting_field: 'createdAt',
};

// ============================================================================
// SYNC PRODUCT TO TYPESENSE (Trigger on Product Write)
// ============================================================================

/**
 * Sync product to Typesense when created or updated in Firestore
 */
export const onProductWrite = functions.firestore
    .document('products/{productId}')
    .onWrite(async (change, context) => {
        const client = getTypesenseClient();
        if (!client) return;

        const productId = context.params.productId;

        // Product deleted
        if (!change.after.exists) {
            try {
                await client.collections('products').documents(productId).delete();
                functions.logger.info(`[search] Deleted product ${productId} from index`);
            } catch (error: unknown) {
                // Ignore if not found
                if (error instanceof Error && !error.message.includes('Not Found')) {
                    functions.logger.error(`[search] Error deleting product ${productId}:`, error);
                }
            }
            return;
        }

        const product = change.after.data();

        // Guard against undefined product data
        if (!product) {
            functions.logger.warn(`[search] Product ${productId} has no data`);
            return;
        }

        // Skip deleted or inactive products
        if (product.isDeleted) {
            try {
                await client.collections('products').documents(productId).delete();
            } catch {
                // Ignore
            }
            return;
        }

        // Build document for Typesense
        const document: Record<string, unknown> = {
            id: productId,
            name: product.name || '',
            description: product.description || '',
            price: product.price || 0,
            category: product.category || 'Other',
            tags: product.tags || product.badges || [],
            image: product.images?.[0] || product.image || '',
            inStock: product.inStock ?? (product.stock > 0),
            rating: product.rating || 0,
            reviewCount: product.reviewCount || 0,
            createdAt: product.createdAt?.toMillis() || Date.now(),
        };
        if (product.coinPrice) document.coinPrice = product.coinPrice;
        if (product.brand) document.brand = product.brand;
        if (product.vendor) document.vendor = product.vendor;

        try {
            await client.collections('products').documents().upsert(document);
            functions.logger.info(`[search] Indexed product ${productId}: ${product.name}`);
        } catch (error) {
            functions.logger.error(`[search] Error indexing product ${productId}:`, error);
        }
    });

// ============================================================================
// INITIALIZE SEARCH INDEX (Admin callable)
// ============================================================================

/**
 * Create the products collection in Typesense
 * Run once during initial setup
 */
export const initializeSearchIndex = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    // Verify admin
    const userDoc = await db.doc(`users/${context.auth.uid}`).get();
    if (userDoc.data()?.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const client = getTypesenseClient();
    if (!client) {
        throw new functions.https.HttpsError('failed-precondition', 'Typesense not configured');
    }

    try {
        // Try to delete existing collection
        try {
            await client.collections('products').delete();
        } catch {
            // Collection doesn't exist, ignore
        }

        // Create fresh collection
        await client.collections().create(PRODUCT_SCHEMA);
        functions.logger.info('[search] Created products collection');

        return { success: true, message: 'Search index initialized' };
    } catch (error) {
        functions.logger.error('[search] Error initializing index:', error);
        throw new functions.https.HttpsError('internal', 'Failed to initialize search index');
    }
});

// ============================================================================
// REINDEX ALL PRODUCTS (Admin callable)
// ============================================================================

/**
 * Reindex all products from Firestore to Typesense
 * Use after initial setup or to fix sync issues
 */
export const reindexAllProducts = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    // Verify admin
    const userDoc = await db.doc(`users/${context.auth.uid}`).get();
    if (userDoc.data()?.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const client = getTypesenseClient();
    if (!client) {
        throw new functions.https.HttpsError('failed-precondition', 'Typesense not configured');
    }

    try {
        const productsSnap = await db.collection('products')
            .where('isDeleted', '!=', true)
            .get();

        let indexed = 0;
        let failed = 0;
        const batchSize = 100;
        const documents: Array<Record<string, unknown>> = [];

        for (const doc of productsSnap.docs) {
            const product = doc.data();

            const entry: Record<string, unknown> = {
                id: doc.id,
                name: product.name || '',
                description: product.description || '',
                price: product.price || 0,
                category: product.category || 'Other',
                tags: product.tags || product.badges || [],
                image: product.images?.[0] || product.image || '',
                inStock: product.inStock ?? (product.stock > 0),
                rating: product.rating || 0,
                reviewCount: product.reviewCount || 0,
                createdAt: product.createdAt?.toMillis() || Date.now(),
            };
            if (product.coinPrice) entry.coinPrice = product.coinPrice;
            if (product.brand) entry.brand = product.brand;
            if (product.vendor) entry.vendor = product.vendor;
            documents.push(entry);

            // Batch import
            if (documents.length >= batchSize) {
                try {
                    await client.collections('products').documents().import(documents, { action: 'upsert' });
                    indexed += documents.length;
                } catch (error) {
                    failed += documents.length;
                    functions.logger.error('[search] Batch import error:', error);
                }
                documents.length = 0;
            }
        }

        // Remaining documents
        if (documents.length > 0) {
            try {
                await client.collections('products').documents().import(documents, { action: 'upsert' });
                indexed += documents.length;
            } catch (error) {
                failed += documents.length;
                functions.logger.error('[search] Final batch import error:', error);
            }
        }

        functions.logger.info(`[search] Reindexed ${indexed} products, ${failed} failed`);
        return { success: true, indexed, failed };
    } catch (error) {
        functions.logger.error('[search] Reindex error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to reindex products');
    }
});

// ============================================================================
// GET SEARCH API KEY (For client-side search)
// ============================================================================

/**
 * Get a search-only API key for client-side queries
 * This key can only search, not modify the index
 */
export const getSearchApiKey = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const config = functions.config().typesense;
    if (!config?.search_key) {
        throw new functions.https.HttpsError('failed-precondition', 'Search key not configured');
    }

    return {
        host: config.host,
        port: parseInt(config.port || '443'),
        protocol: config.protocol || 'https',
        apiKey: config.search_key, // Read-only key
    };
});
