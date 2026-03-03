// File: server/src/utils/storage.ts
/**
 * Cloudinary Storage Client Configuration
 */
import { v2 as cloudinary } from 'cloudinary';

let isConfigured = false;

function isProductionLikeEnv() {
    return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
}

function configureCloudinary() {
    if (isConfigured) return;

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true,
        });
        isConfigured = true;
    }
}

/**
 * Generate upload parameters for client-side direct upload to Cloudinary.
 * @param key The object key (path and filename) without extension
 * @param contentType The MIME type of the file
 */
export async function generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600
): Promise<{ uploadUrl: string; key: string, method?: string, fields?: Record<string, string>, publicUrl?: string }> {
    configureCloudinary();

    if (!isConfigured) {
        if (isProductionLikeEnv()) {
            throw new Error('Cloudinary storage is not configured for this environment');
        }

        console.warn('Cloudinary credentials missing, returning mock upload URL (development only)');
        return {
            uploadUrl: `http://localhost:3001/api/mock-upload`,
            key,
            publicUrl: `https://pub-mock-thinkmart.cloudinary.test/${key}`
        };
    }

    const timestamp = Math.round((new Date()).getTime() / 1000);
    const apiSecret = cloudinary.config().api_secret;

    const paramsToSign: Record<string, any> = {
        timestamp: timestamp,
        public_id: key,
    };

    if (process.env.CLOUDINARY_UPLOAD_PRESET) {
        paramsToSign.upload_preset = process.env.CLOUDINARY_UPLOAD_PRESET;
    }

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret!);

    const cloudName = cloudinary.config().cloud_name;
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

    const fields = {
        api_key: cloudinary.config().api_key!,
        timestamp: timestamp.toString(),
        signature: signature,
        public_id: key,
    } as Record<string, string>;

    if (process.env.CLOUDINARY_UPLOAD_PRESET) {
        fields.upload_preset = process.env.CLOUDINARY_UPLOAD_PRESET;
    }

    const publicUrl = cloudinary.url(key, { secure: true });

    return {
        uploadUrl,
        key,
        method: 'POST',
        fields,
        publicUrl
    };
}

/**
 * Generate a public URL for accessing the uploaded object.
 */
export function getPublicUrl(key: string): string {
    configureCloudinary();
    if (!isConfigured) {
        return `https://pub-mock-thinkmart.cloudinary.test/${key}`;
    }
    return cloudinary.url(key, { secure: true });
}
