// File: services/productService.ts
/**
 * Product Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { ApiProduct } from '@/lib/api/types';

export interface ProductFilters {
    category?: string;
    search?: string;
    vendor?: string;
    inStock?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export async function fetchProducts(
    filters: ProductFilters = {},
    page = 1,
    pageLimit = 20
): Promise<PaginatedResponse<ApiProduct>> {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(pageLimit),
    });
    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.vendor) params.set('vendor', filters.vendor);
    if (filters.inStock) params.set('inStock', 'true');
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

    return apiClient.get<PaginatedResponse<ApiProduct>>(`/api/products?${params.toString()}`);
}

export async function fetchProduct(id: string): Promise<ApiProduct | null> {
    try {
        const res = await apiClient.get<{ data: ApiProduct }>(`/api/products/${id}`);
        return res.data;
    } catch (error: any) {
        if (error?.statusCode === 404) return null;
        throw error;
    }
}

export interface CreateProductInput {
    name: string;
    description: string;
    price: number;
    category: string;
    image: string;
    images?: string[];
    commission?: number;
    coinPrice?: number;
    stock?: number;
    badges?: string[];
    coinOnly?: boolean;
    cashOnly?: boolean;
    deliveryDays?: number;
    inStock?: boolean;
    isActive?: boolean;
}

export async function createProduct(input: CreateProductInput): Promise<{ id: string }> {
    const res = await apiClient.post<{ data: { id: string } }>('/api/products', input);
    return res.data;
}

export async function updateProduct(id: string, updates: Partial<CreateProductInput>): Promise<void> {
    await apiClient.patch(`/api/products/${id}`, updates);
}

export async function deleteProduct(id: string): Promise<void> {
    await apiClient.delete(`/api/products/${id}`);
}
