// File: functions/src/admin/uploadProductImage.ts
/**
 * Secure Product Image Upload via Cloud Function
 * 
 * This function handles product image uploads server-side to bypass
 * client-side storage rules that block direct product uploads.
 * 
 * SECURITY: 
 * - Admin/vendor only
 * - Rate limited
 * - File type/size validated
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { validate, UploadProductImageSchema, UploadProductImage } from '../lib/validation';
import { enforceRateLimit, RATE_LIMIT_UPLOAD } from '../lib/rateLimit';

const db = admin.firestore();
type StorageBucket = ReturnType<ReturnType<typeof admin.storage>["bucket"]>;
let cachedBucket: StorageBucket | null = null;

function readStorageBucketFromFirebaseConfig(): string | null {
    const rawConfig = process.env.FIREBASE_CONFIG;
    if (!rawConfig) return null;

    try {
        const parsed = JSON.parse(rawConfig) as { storageBucket?: unknown };
        if (typeof parsed.storageBucket === "string" && parsed.storageBucket.trim()) {
            return parsed.storageBucket.trim();
        }
    } catch {
        // Ignore malformed FIREBASE_CONFIG and rely on other hints.
    }

    return null;
}

function getStorageBucket(): StorageBucket {
    if (cachedBucket) {
        return cachedBucket;
    }

    const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || null;
    const candidates = Array.from(
        new Set(
            [
                process.env.FIREBASE_STORAGE_BUCKET,
                process.env.STORAGE_BUCKET,
                readStorageBucketFromFirebaseConfig(),
                projectId ? `${projectId}.firebasestorage.app` : null,
                projectId ? `${projectId}.appspot.com` : null,
            ]
                .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                .map((value) => value.trim())
        )
    );

    for (const bucketName of candidates) {
        cachedBucket = admin.storage().bucket(bucketName);
        if (cachedBucket?.name) {
            return cachedBucket;
        }
    }

    try {
        cachedBucket = admin.storage().bucket();
        return cachedBucket;
    } catch (error) {
        functions.logger.error("[uploadProductImage] Storage bucket is not configured", error);
        throw new functions.https.HttpsError(
            "failed-precondition",
            "Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET for Cloud Functions."
        );
    }
}

/**
 * Upload a product image (base64 encoded) and return the public URL
 * Only accessible by admins and vendors
 */
export const uploadProductImage = functions.https.onCall(async (data, context) => {
    // 1. Authentication check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // 2. Authorization check (admin, sub_admin, or vendor)
    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.data();
    const role = userData?.role;

    if (!['admin', 'sub_admin', 'vendor'].includes(role)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admins and vendors can upload product images'
        );
    }

    // 3. Rate limit check
    await enforceRateLimit(`upload:${userId}`, RATE_LIMIT_UPLOAD);

    // 4. Validate input
    const validatedData = validate(UploadProductImageSchema, data);
    const { productId, imageBase64, contentType } = validatedData;
    const position = validatedData.position ?? 0;

    // 5. Verify product exists and user has access
    const productRef = db.doc(`products/${productId}`);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Product not found');
    }

    const productData = productDoc.data();

    // Vendors can only upload to their own products
    if (role === 'vendor' && productData?.vendorId !== userId) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'You can only upload images to your own products'
        );
    }

    // 6. Decode and validate base64 data
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let detectedContentType: string;

    if (matches && matches.length === 3) {
        // Data URL format
        detectedContentType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
    } else {
        // Raw base64
        buffer = Buffer.from(imageBase64, 'base64');
        detectedContentType = contentType;
    }

    // Validate size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            `Image too large. Maximum size is 5MB, got ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`
        );
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(detectedContentType)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            `Invalid image type: ${detectedContentType}. Allowed: ${allowedTypes.join(', ')}`
        );
    }

    // 7. Generate file path and upload
    const extension = detectedContentType.split('/')[1];
    const timestamp = Date.now();
    const filename = `products/${productId}/${position}_${timestamp}.${extension}`;
    const bucket = getStorageBucket();

    const file = bucket.file(filename);

    await file.save(buffer, {
        metadata: {
            contentType: detectedContentType,
            metadata: {
                uploadedBy: userId,
                productId,
                position: String(position),
            },
        },
    });

    // Make file publicly readable
    await file.makePublic();

    // 8. Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    // 9. Update product document with new image URL
    const currentImages: string[] = productData?.images || [];

    // Insert or replace image at position
    while (currentImages.length <= position) {
        currentImages.push('');
    }
    currentImages[position] = publicUrl;

    // Filter out empty strings and update
    const updatedImages = currentImages.filter(url => url.length > 0);
    const primaryImage = updatedImages[0] || null;

    await productRef.update({
        images: updatedImages,
        image: primaryImage || '',
        imageUrl: primaryImage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 10. Log the upload for audit
    await db.collection('audit_logs').add({
        action: 'product_image_upload',
        userId,
        targetId: productId,
        details: {
            filename,
            size: buffer.length,
            contentType: detectedContentType,
            position,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        imageUrl: publicUrl,
        position,
        totalImages: updatedImages.length,
    };
});

/**
 * Delete a product image
 * Only accessible by admins and the vendor who owns the product
 */
export const deleteProductImage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    const { productId, imageUrl } = data;

    if (!productId || !imageUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'productId and imageUrl are required');
    }

    // Check authorization
    const userDoc = await db.doc(`users/${userId}`).get();
    const role = userDoc.data()?.role;

    if (!['admin', 'sub_admin', 'vendor'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }

    // Verify product and ownership
    const productRef = db.doc(`products/${productId}`);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Product not found');
    }

    const productData = productDoc.data();

    if (role === 'vendor' && productData?.vendorId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Not your product');
    }

    // Remove image URL from product
    const currentImages: string[] = productData?.images || [];
    const updatedImages = currentImages.filter(url => url !== imageUrl);
    const primaryImage = updatedImages[0] || null;

    await productRef.update({
        images: updatedImages,
        image: primaryImage || '',
        imageUrl: primaryImage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Try to delete from storage (extract path from URL)
    try {
        const bucket = getStorageBucket();
        const bucketName = bucket.name;
        if (imageUrl.includes(bucketName)) {
            const path = imageUrl.split(`${bucketName}/`)[1];
            if (path) {
                await bucket.file(path).delete();
            }
        }
    } catch (err) {
        // Log but don't fail if storage delete fails
        console.warn('Failed to delete storage file:', err);
    }

    // Audit log
    await db.collection('audit_logs').add({
        action: 'product_image_delete',
        userId,
        targetId: productId,
        details: { imageUrl },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        remainingImages: updatedImages.length,
    };
});
