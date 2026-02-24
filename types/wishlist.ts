// File: types/wishlist.ts
/**
 * Wishlist Types
 * Users can save products to their wishlist for later purchase
 */

import { Timestamp } from 'firebase/firestore';

export interface WishlistItem {
    id: string;
    userId: string;
    productId: string;

    // Product snapshot (for display when product might be deleted/changed)
    productName: string;
    productImage: string;
    productPrice: number;
    productCoinPrice?: number;

    // Metadata
    addedAt: Timestamp;

    // Optional notification preferences
    notifyOnPriceDrop?: boolean;
    notifyOnBackInStock?: boolean;
}

export interface WishlistStats {
    userId: string;
    totalItems: number;
    lastUpdated: Timestamp;
}
