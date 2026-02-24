// File: types/review.ts
/**
 * Product Review Types
 * Users can review products after order is delivered
 */

import { Timestamp } from 'firebase/firestore';

export interface Review {
    id: string;
    productId: string;
    userId: string;
    orderId: string; // The order this review is for (ensures user purchased the product)

    // Review content
    rating: number; // 1-5 stars
    title?: string;
    content: string;

    // Media (optional)
    images?: string[]; // User-uploaded review images (max 3)

    // User info snapshot (denormalized for display)
    userName: string;
    userAvatar?: string;

    // Metadata
    helpful: number; // Count of users who found this helpful
    verified: boolean; // User actually purchased the product

    // Status
    status: 'pending' | 'approved' | 'rejected' | 'flagged';
    moderationNote?: string; // Admin note if rejected

    // Timestamps
    createdAt: Timestamp;
    updatedAt?: Timestamp;
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
    lastUpdated: Timestamp;
}

export interface ReviewHelpful {
    reviewId: string;
    userId: string;
    helpful: boolean; // true = helpful, false = not helpful
    createdAt: Timestamp;
}
