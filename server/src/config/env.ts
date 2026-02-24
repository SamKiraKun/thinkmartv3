// File: server/src/config/env.ts
/**
 * Environment configuration with Zod validation.
 * Fails fast on startup if required env vars are missing.
 */

import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file in non-production environments
if (process.env.NODE_ENV !== 'production') {
    config();
}

const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // TursoDB
    TURSO_DATABASE_URL: z.string().min(1, 'TURSO_DATABASE_URL is required'),
    TURSO_AUTH_TOKEN: z.string().optional(),

    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // Firebase Admin
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    FIREBASE_PROJECT_ID: z.string().optional(),

    // Cloudflare R2
    R2_ACCOUNT_ID: z.string().optional(),
    R2_REGION: z.string().optional(),
    R2_ENDPOINT: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().default('thinkmart-assets'),
    R2_PUBLIC_URL: z.string().optional(),

    // Typesense
    TYPESENSE_HOST: z.string().optional(),
    TYPESENSE_API_KEY: z.string().optional(),

    // CORS
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

    // Feature Flags
    FF_READ_API_ENABLED: z.coerce.boolean().default(true),
    FF_WRITE_API_ENABLED: z.coerce.boolean().default(true),
    FF_REALTIME_ENABLED: z.coerce.boolean().default(false),
    FF_UPLOAD_R2_ENABLED: z.coerce.boolean().default(false),
    FF_JOBS_ENABLED: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(result.error.format());
        process.exit(1);
    }

    return result.data;
}

export const env = loadEnv();
