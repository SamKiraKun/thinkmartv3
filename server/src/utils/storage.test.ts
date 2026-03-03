import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function importStorageModule() {
    vi.resetModules();
    return import('./storage.js');
}

describe('storage utils', () => {
    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
        delete process.env.CLOUDINARY_CLOUD_NAME;
        delete process.env.CLOUDINARY_API_KEY;
        delete process.env.CLOUDINARY_API_SECRET;
        delete process.env.CLOUDINARY_UPLOAD_PRESET;
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

    it('returns a mock upload URL in development when Cloudinary is not configured', async () => {
        process.env.NODE_ENV = 'development';
        const { generatePresignedUploadUrl } = await importStorageModule();

        const result = await generatePresignedUploadUrl('users/u1/file.png', 'image/png');

        expect(result.key).toBe('users/u1/file.png');
        expect(result.uploadUrl).toBe('http://localhost:3001/api/mock-upload');
        expect(result.publicUrl).toBe('https://pub-mock-thinkmart.cloudinary.test/users/u1/file.png');
    });

    it('throws in production when Cloudinary is not configured', async () => {
        process.env.NODE_ENV = 'production';
        const { generatePresignedUploadUrl } = await importStorageModule();

        await expect(
            generatePresignedUploadUrl('users/u1/file.png', 'image/png')
        ).rejects.toThrow('Cloudinary storage is not configured for this environment');
    });

    it('builds mock public URLs when Cloudinary is not configured', async () => {
        const { getPublicUrl } = await importStorageModule();

        expect(getPublicUrl('products/p1/img.webp')).toBe(
            'https://pub-mock-thinkmart.cloudinary.test/products/p1/img.webp'
        );
    });
});
