// File: services/review.service.ts
/**
 * Review Service (compat wrapper, API/Turso-backed)
 */

import { apiClient } from '@/lib/api/client';
import {
    createReview as createReviewApi,
    deleteReview as deleteReviewApi,
    fetchProductReviews,
    fetchReviewStats,
    markReviewHelpful as markReviewHelpfulApi,
    updateReview as updateReviewApi,
} from '@/services/reviewService';

export interface Review {
    id: string;
    productId: string;
    userId: string;
    orderId: string;
    rating: number;
    title?: string;
    content: string;
    images?: string[];
    userName: string;
    userAvatar?: string;
    helpful: number;
    verified: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'flagged';
    createdAt: Date;
    updatedAt?: Date;
}

export interface ReviewStats {
    productId: string;
    totalReviews: number;
    averageRating: number;
    ratingDistribution: {
        1: number;
        2: number;
        3: number;
        4: number;
        5: number;
    };
}

type CompatCursor = { offset: number } | null;

function mapApiReview(r: any): Review {
    return {
        id: r.id,
        productId: r.productId,
        userId: r.userId,
        orderId: r.orderId || '',
        rating: Number(r.rating || 0),
        title: r.title || undefined,
        content: r.content || '',
        images: Array.isArray(r.images) ? r.images : [],
        userName: r.userName || 'User',
        userAvatar: r.userAvatar || undefined,
        helpful: Number(r.helpful || 0),
        verified: Boolean(r.verified),
        status: (r.status || 'approved') as Review['status'],
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : undefined,
    };
}

export async function getProductReviews(
    productId: string,
    options: {
        limit?: number;
        lastDoc?: CompatCursor;
        sortBy?: 'newest' | 'helpful' | 'rating';
    } = {}
): Promise<{ reviews: Review[]; lastDoc: CompatCursor }> {
    const pageLimit = Math.max(1, options.limit || 10);
    const offset = options.lastDoc?.offset || 0;
    const page = Math.floor(offset / pageLimit) + 1;
    const res = await fetchProductReviews(productId, page, pageLimit);

    let reviews = res.data.map(mapApiReview);
    if (options.sortBy === 'helpful') {
        reviews = [...reviews].sort((a, b) => b.helpful - a.helpful);
    } else if (options.sortBy === 'rating') {
        reviews = [...reviews].sort((a, b) => b.rating - a.rating);
    }

    const nextOffset = offset + reviews.length;
    return {
        reviews,
        lastDoc: res.pagination.hasNext ? { offset: nextOffset } : null,
    };
}

export async function getReviewStats(productId: string): Promise<ReviewStats | null> {
    const stats = await fetchReviewStats(productId);
    if (!stats) return null;
    return {
        productId: stats.productId,
        totalReviews: Number(stats.totalReviews || 0),
        averageRating: Number(stats.averageRating || 0),
        ratingDistribution: stats.ratingDistribution as ReviewStats['ratingDistribution'],
    };
}

export async function getUserReviews(_userId: string): Promise<Review[]> {
    const res = await apiClient.get<{ data: any[]; pagination: any }>('/api/reviews/mine?page=1&limit=50');
    return (res.data || []).map(mapApiReview);
}

export async function canUserReview(
    _userId: string,
    productId: string
): Promise<{ canReview: boolean; orderId?: string }> {
    const res = await apiClient.get<{ data: { canReview: boolean; orderId?: string } }>(
        `/api/reviews/can-review?productId=${encodeURIComponent(productId)}`
    );
    return res.data;
}

export async function submitReview(data: {
    orderId: string;
    productId: string;
    rating: number;
    title?: string;
    content: string;
    images?: string[];
}): Promise<{ reviewId: string }> {
    const result = await createReviewApi(data);
    return { reviewId: result.id };
}

export async function updateReview(data: {
    reviewId: string;
    rating?: number;
    title?: string;
    content?: string;
    images?: string[];
}): Promise<void> {
    await updateReviewApi(data.reviewId, {
        rating: data.rating,
        title: data.title,
        content: data.content,
        images: data.images,
    });
}

export async function deleteReview(reviewId: string): Promise<void> {
    await deleteReviewApi(reviewId);
}

export async function markReviewHelpful(reviewId: string, helpful: boolean): Promise<void> {
    if (!helpful) {
        // API currently only supports positive helpful vote parity.
        return;
    }
    await markReviewHelpfulApi(reviewId);
}
