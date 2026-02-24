// File: types/coupon.ts
/**
 * Coupon/Promo Code Types
 * For marketing discounts and promotional campaigns
 */

import { Timestamp } from 'firebase/firestore';

export interface Coupon {
    id: string;
    code: string; // Unique coupon code (uppercase)

    // Discount configuration
    discountType: 'percentage' | 'fixed' | 'free_shipping';
    discountValue: number; // Percentage (0-100) or fixed amount

    // Validity
    validFrom: Timestamp;
    validUntil: Timestamp;
    isActive: boolean;

    // Usage limits
    maxUses: number; // 0 = unlimited
    usedCount: number;
    maxUsesPerUser: number; // 0 = unlimited per user

    // Requirements
    minOrderAmount?: number; // Minimum order value
    minOrderItems?: number; // Minimum number of items

    // Restrictions
    applicableProducts?: string[]; // Empty = all products
    applicableCategories?: string[]; // Empty = all categories
    excludedProducts?: string[];
    firstTimeOnly?: boolean; // Only for first-time buyers

    // Metadata
    description?: string;
    createdBy: string;
    createdAt: Timestamp;
    updatedAt?: Timestamp;
}

export interface CouponUsage {
    id: string;
    couponId: string;
    couponCode: string;
    userId: string;
    orderId: string;
    discountAmount: number;
    usedAt: Timestamp;
}

export interface CouponValidationResult {
    valid: boolean;
    message: string;
    coupon?: Coupon;
    discountAmount?: number;
}
