// File: lib/featureFlags.ts
/**
 * Feature flags for gradual migration from Firebase to Turso/API.
 * 
 * Controls whether frontend reads/writes go through:
 * - Firebase SDK (legacy path)
 * - New Fastify API (migration path)
 * 
 * Flags are read from NEXT_PUBLIC env vars (set in Vercel).
 */

export const featureFlags = {
    /** Route read operations through new API instead of Firestore */
    readApiEnabled: process.env.NEXT_PUBLIC_FF_READ_API_ENABLED === 'true',

    /** Route write operations through new API instead of Cloud Functions */
    writeApiEnabled: process.env.NEXT_PUBLIC_FF_WRITE_API_ENABLED === 'true',

    /** Use WebSocket/SSE instead of Firestore onSnapshot */
    realtimeEnabled: process.env.NEXT_PUBLIC_FF_REALTIME_ENABLED === 'true',

    /** Use R2 presigned uploads instead of Firebase Storage */
    uploadR2Enabled: process.env.NEXT_PUBLIC_FF_UPLOAD_R2_ENABLED === 'true',
};

/**
 * Check if a specific domain should use the API for reads.
 * Falls back to global read flag if domain-specific flag is not set.
 */
export function shouldUseApiRead(domain: string): boolean {
    const domainFlag = process.env[`NEXT_PUBLIC_TM_${domain.toUpperCase()}_READ_API`];
    if (domainFlag !== undefined) {
        return domainFlag === 'true';
    }
    return featureFlags.readApiEnabled;
}

/**
 * Check if a specific domain should use the API for writes.
 * Falls back to global write flag if domain-specific flag is not set.
 */
export function shouldUseApiWrite(domain: string): boolean {
    const domainFlag = process.env[`NEXT_PUBLIC_TM_${domain.toUpperCase()}_WRITE_API`];
    if (domainFlag !== undefined) {
        return domainFlag === 'true';
    }
    return featureFlags.writeApiEnabled;
}

export default featureFlags;
