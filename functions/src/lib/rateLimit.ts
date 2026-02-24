// File: functions/src/lib/rateLimit.ts
/**
 * Rate Limiting Utilities for Cloud Functions
 * Uses Firestore for distributed rate limiting across function instances
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

interface RateLimitConfig {
    /** Maximum number of requests allowed */
    maxRequests: number;
    /** Time window in seconds */
    windowSeconds: number;
    /** Optional: Custom error message */
    errorMessage?: string;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
}

/**
 * Check and consume rate limit for a given key
 * Uses atomic Firestore operations for distributed safety
 */
export async function checkRateLimit(
    key: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);
    const docRef = db.doc(`rate_limits/${key}`);

    const result = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const data = doc.data();

        // If no document or window has expired, reset
        if (!data || data.windowStart < windowStart) {
            transaction.set(docRef, {
                count: 1,
                windowStart: now,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return {
                allowed: true,
                remaining: config.maxRequests - 1,
                resetAt: new Date(now + config.windowSeconds * 1000),
            };
        }

        // Check if limit exceeded
        if (data.count >= config.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(data.windowStart + config.windowSeconds * 1000),
            };
        }

        // Increment count
        transaction.update(docRef, {
            count: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
            allowed: true,
            remaining: config.maxRequests - data.count - 1,
            resetAt: new Date(data.windowStart + config.windowSeconds * 1000),
        };
    });

    return result;
}

/**
 * Enforces rate limit and throws HttpsError if exceeded
 */
export async function enforceRateLimit(
    key: string,
    config: RateLimitConfig
): Promise<void> {
    const result = await checkRateLimit(key, config);

    if (!result.allowed) {
        const retryAfterSeconds = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
        throw new functions.https.HttpsError(
            'resource-exhausted',
            config.errorMessage || `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`
        );
    }
}

/**
 * Higher-order function to wrap a Cloud Function with rate limiting
 */
export function withRateLimit<T>(
    config: RateLimitConfig,
    keyGenerator: (data: T, context: functions.https.CallableContext) => string,
    handler: (data: T, context: functions.https.CallableContext) => Promise<unknown>
): (data: T, context: functions.https.CallableContext) => Promise<unknown> {
    return async (data: T, context: functions.https.CallableContext) => {
        const key = keyGenerator(data, context);
        await enforceRateLimit(key, config);
        return handler(data, context);
    };
}

// ============================================================================
// PRESET RATE LIMIT CONFIGURATIONS
// ============================================================================

/** Standard API rate limit: 60 requests per minute */
export const RATE_LIMIT_STANDARD: RateLimitConfig = {
    maxRequests: 60,
    windowSeconds: 60,
    errorMessage: 'Too many requests. Please wait a moment.',
};

/** Auth operations: 5 per minute (login, register, password reset) */
export const RATE_LIMIT_AUTH: RateLimitConfig = {
    maxRequests: 5,
    windowSeconds: 60,
    errorMessage: 'Too many authentication attempts. Try again later.',
};

/** Financial operations: 10 per hour */
export const RATE_LIMIT_FINANCIAL: RateLimitConfig = {
    maxRequests: 10,
    windowSeconds: 3600,
    errorMessage: 'Financial operation limit reached. Try again in an hour.',
};

/** Withdrawal: 3 per day */
export const RATE_LIMIT_WITHDRAWAL: RateLimitConfig = {
    maxRequests: 3,
    windowSeconds: 86400,
    errorMessage: 'Daily withdrawal limit reached. Try again tomorrow.',
};

/** File upload: 20 per hour */
export const RATE_LIMIT_UPLOAD: RateLimitConfig = {
    maxRequests: 20,
    windowSeconds: 3600,
    errorMessage: 'Upload limit reached. Please try again later.',
};

/** Admin operations: 100 per minute */
export const RATE_LIMIT_ADMIN: RateLimitConfig = {
    maxRequests: 100,
    windowSeconds: 60,
    errorMessage: 'Admin API rate limit exceeded.',
};

/** Game actions: 10 per minute (spin, lucky box) */
export const RATE_LIMIT_GAME: RateLimitConfig = {
    maxRequests: 10,
    windowSeconds: 60,
    errorMessage: 'Please slow down. Take a breath!',
};
