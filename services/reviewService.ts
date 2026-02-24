// File: services/reviewService.ts
/**
 * Review Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { ApiReview, ApiReviewStats } from '@/lib/api/types';

export async function fetchProductReviews(
    productId: string,
    page = 1,
    pageLimit = 10
): Promise<PaginatedResponse<ApiReview>> {
    return apiClient.get<PaginatedResponse<ApiReview>>(
        `/api/reviews?productId=${encodeURIComponent(productId)}&page=${page}&limit=${pageLimit}`
    );
}

export async function fetchReviewStats(productId: string): Promise<ApiReviewStats | null> {
    try {
        const res = await apiClient.get<{ data: ApiReviewStats }>(
            `/api/reviews/stats/${encodeURIComponent(productId)}`
        );
        return res.data;
    } catch (error: any) {
        if (error?.statusCode === 404) return null;
        throw error;
    }
}

export interface CreateReviewInput {
    productId: string;
    orderId?: string;
    rating: number;
    title?: string;
    content: string;
    images?: string[];
}

export async function createReview(input: CreateReviewInput): Promise<{ id: string }> {
    if (!input.orderId) {
        throw new Error('orderId is required to create a review via the API');
    }
    const res = await apiClient.post<{ data: { id: string } }>('/api/reviews', input);
    return res.data;
}

export async function updateReview(
    id: string,
    updates: { rating?: number; title?: string; content?: string; images?: string[] }
): Promise<void> {
    await apiClient.patch(`/api/reviews/${id}`, updates);
}

export async function deleteReview(id: string): Promise<void> {
    await apiClient.delete(`/api/reviews/${id}`);
}

export async function markReviewHelpful(id: string): Promise<{ helpful: number }> {
    const res = await apiClient.post<{ data: { helpful: number } }>(`/api/reviews/${id}/helpful`);
    return res.data;
}

