// File: services/catalogService.ts
/**
 * Catalog Service (API/Turso-backed)
 */

import { apiClient } from '@/lib/api/client';
import type { ApiCategory, ApiBrand, ApiBanner } from '@/lib/api/types';

export async function fetchCategories(): Promise<ApiCategory[]> {
    const res = await apiClient.get<{ data: ApiCategory[] }>('/api/catalog/categories', { public: true });
    return res.data;
}

export async function fetchBrands(): Promise<ApiBrand[]> {
    const res = await apiClient.get<{ data: ApiBrand[] }>('/api/catalog/brands', { public: true });
    return res.data;
}

export async function fetchBanners(): Promise<ApiBanner[]> {
    const res = await apiClient.get<{ data: ApiBanner[] }>('/api/catalog/banners', { public: true });
    return res.data;
}

