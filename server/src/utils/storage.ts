// File: server/src/utils/storage.ts
/**
 * R2 / S3 Storage Client Configuration
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client: S3Client | null = null;

function isProductionLikeEnv() {
    return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
}

function getS3Client(): S3Client {
    if (s3Client) return s3Client;

    s3Client = new S3Client({
        region: process.env.R2_REGION || 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
    });

    return s3Client;
}

export const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'thinkmart-uploads';

/**
 * Generate a presigned URL for uploading a file directly from the client to R2.
 * @param key The object key (path and filename) in the bucket
 * @param contentType The MIME type of the file to be uploaded
 * @param expiresIn Time in seconds until the URL expires (default: 3600)
 */
export async function generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600
): Promise<{ uploadUrl: string; key: string }> {
    // Development-only mock fallback. Staging/production must be explicitly configured.
    if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        if (isProductionLikeEnv()) {
            throw new Error('R2 storage is not configured for this environment');
        }

        console.warn('R2 credentials missing, returning mock presigned URL (development only)');
        return {
            uploadUrl: `http://localhost:3001/api/mock-upload?key=${encodeURIComponent(key)}`,
            key,
        };
    }

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn });
    return { uploadUrl, key };
}

/**
 * Generate a public URL for accessing the uploaded object.
 */
export function getPublicUrl(key: string): string {
    const publicBase = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_DOMAIN;

    if (!publicBase) {
        if (isProductionLikeEnv()) {
            throw new Error('R2_PUBLIC_URL is required in production/staging');
        }

        return `https://pub-mock-thinkmart.r2.dev/${key}`;
    }

    return `${publicBase.replace(/\/+$/, '')}/${key}`;
}
