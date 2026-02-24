// File: functions/src/admin/bulkImport.ts
/**
 * Bulk Product Import Cloud Function
 * 
 * Allows vendors/admins to import products via CSV.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';

const db = admin.firestore();

// ============================================================================
// VALIDATION
// ============================================================================

const ProductRowSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    price: z.number().positive(),
    category: z.string().optional(),
    stock: z.number().int().min(0).optional(),
    coinPrice: z.number().int().min(0).optional(),
    badges: z.string().optional(), // Comma-separated
});

const BulkImportSchema = z.object({
    products: z.array(ProductRowSchema).min(1).max(100),
});

// ============================================================================
// BULK IMPORT PRODUCTS
// ============================================================================

/**
 * Bulk import products from CSV data
 * CSV parsed by frontend, sent as array of objects
 */
export const bulkImportProducts = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // Verify admin or vendor role
    const userDoc = await db.doc(`users/${userId}`).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'sub_admin', 'vendor'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Vendor only');
    }

    const parsed = BulkImportSchema.safeParse(data);
    if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.message);
    }

    const { products } = parsed.data;
    const results: { success: number; failed: number; errors: string[] } = {
        success: 0,
        failed: 0,
        errors: [],
    };

    // Process in batches
    const batch = db.batch();

    for (let i = 0; i < products.length; i++) {
        const product = products[i];

        try {
            const productRef = db.collection('products').doc();

            batch.set(productRef, {
                id: productRef.id,
                name: product.name.trim(),
                description: product.description?.trim() || '',
                price: Math.round(product.price * 100) / 100,
                category: product.category || 'Other',
                stock: product.stock || 0,
                coinPrice: product.coinPrice || null,
                badges: product.badges?.split(',').map(b => b.trim()).filter(Boolean) || [],
                image: '', // To be uploaded separately
                images: [],
                inStock: (product.stock || 0) > 0,
                vendor: role === 'vendor' ? userId : null,
                commission: 0, // Set by admin later
                isDeleted: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                importedAt: admin.firestore.FieldValue.serverTimestamp(),
                importedBy: userId,
            });

            results.success++;
        } catch (error: unknown) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    await batch.commit();

    // Audit log
    await db.collection('audit_logs').add({
        action: 'bulk_import_products',
        userId,
        details: {
            imported: results.success,
            failed: results.failed
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`[bulkImportProducts] User ${userId} imported ${results.success} products`);

    return results;
});

/**
 * Get CSV template for bulk import
 */
export const getBulkImportTemplate = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    return {
        headers: ['name', 'description', 'price', 'category', 'stock', 'coinPrice', 'badges'],
        sampleRow: ['Product Name', 'Product description here', '999', 'Electronics', '10', '500', 'new,popular'],
        instructions: [
            'name: Required. Product name (max 200 chars)',
            'description: Optional. Product description (max 2000 chars)',
            'price: Required. Price in INR (e.g., 999)',
            'category: Optional. Category name',
            'stock: Optional. Stock quantity (default: 0)',
            'coinPrice: Optional. Price in coins',
            'badges: Optional. Comma-separated badges (new, popular, bestseller)',
        ],
    };
});
