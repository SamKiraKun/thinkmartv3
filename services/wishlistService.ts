// File: services/wishlistService.ts
/**
 * Wishlist Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { ApiWishlistItem } from '@/lib/api/types';

export async function fetchWishlist(
    _userId: string,
    page = 1,
    pageLimit = 20
): Promise<PaginatedResponse<ApiWishlistItem>> {
    return apiClient.get<PaginatedResponse<ApiWishlistItem>>(
        `/api/wishlists?page=${page}&limit=${pageLimit}`
    );
}

export async function checkWishlisted(
    _userId: string,
    productId: string
): Promise<{ isWishlisted: boolean; wishlistId: string | null }> {
    const res = await apiClient.get<{ data: { isWishlisted: boolean; wishlistId: string | null } }>(
        `/api/wishlists/check/${productId}`
    );
    return res.data;
}

export async function addToWishlist(
    _userId: string,
    productId: string
): Promise<{ id: string }> {
    const res = await apiClient.post<{ data: { id: string } }>('/api/wishlists', { productId });
    return res.data;
}

export async function removeFromWishlist(
    _userId: string,
    wishlistId: string
): Promise<void> {
    await apiClient.delete(`/api/wishlists/${wishlistId}`);
}

