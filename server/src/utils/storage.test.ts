import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function importStorageModule() {
    vi.resetModules();
    return import('./storage.js');
}

describe('storage utils', () => {
    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
        delete process.env.R2_ENDPOINT;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.R2_PUBLIC_URL;
        delete process.env.R2_PUBLIC_DOMAIN;
        delete process.env.NODE_ENV;
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('returns a mock presigned URL in development when R2 is not configured', async () => {
        process.env.NODE_ENV = 'development';
        const { generatePresignedUploadUrl } = await importStorageModule();

        const result = await generatePresignedUploadUrl('users/u1/file.png', 'image/png');

        expect(result.key).toBe('users/u1/file.png');
        expect(result.uploadUrl).toContain('/api/mock-upload?key=');
    });

    it('throws in production when R2 is not configured', async () => {
        process.env.NODE_ENV = 'production';
        const { generatePresignedUploadUrl } = await importStorageModule();

        await expect(
            generatePresignedUploadUrl('users/u1/file.png', 'image/png')
        ).rejects.toThrow('R2 storage is not configured');
    });

    it('builds public URLs from R2_PUBLIC_URL without duplicate slashes', async () => {
        process.env.R2_PUBLIC_URL = 'https://cdn.thinkmart.com/';
        const { getPublicUrl } = await importStorageModule();

        expect(getPublicUrl('products/p1/img.webp')).toBe(
            'https://cdn.thinkmart.com/products/p1/img.webp'
        );
    });
});
