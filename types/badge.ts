// File: types/badge.ts
/**
 * Achievement Badge Types
 * Gamification system for user engagement and retention
 */

import { Timestamp } from 'firebase/firestore';

export type BadgeCategory =
    | 'referral'
    | 'shopping'
    | 'earning'
    | 'activity'
    | 'special';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface BadgeDefinition {
    id: string;
    name: string;
    description: string;
    icon: string; // Icon name or URL
    category: BadgeCategory;
    rarity: BadgeRarity;

    // Unlock criteria (one of these)
    criteria: {
        type: 'referral_count' | 'order_count' | 'total_spent' | 'total_earned'
        | 'daily_streak' | 'review_count' | 'wishlist_count' | 'manual';
        threshold: number;
    };

    // Rewards
    coinReward: number;
    cashReward?: number;

    // Display
    order: number; // Sort order
    isHidden: boolean; // Hidden until earned
    isActive: boolean;
}

export interface UserBadge {
    id: string;
    badgeId: string;
    userId: string;

    // Badge snapshot
    badgeName: string;
    badgeIcon: string;
    badgeRarity: BadgeRarity;

    // Unlock info
    earnedAt: Timestamp;
    progress?: number; // Progress when earned

    // Rewards claimed
    rewardsClaimed: boolean;
    claimedAt?: Timestamp;
}

export interface BadgeProgress {
    badgeId: string;
    userId: string;
    currentValue: number;
    targetValue: number;
    percentComplete: number;
    lastUpdated: Timestamp;
}

// Pre-defined badges
export const BADGE_DEFINITIONS: Omit<BadgeDefinition, 'id'>[] = [
    // Referral badges
    {
        name: 'First Referral',
        description: 'Refer your first friend to ThinkMart',
        icon: '👥',
        category: 'referral',
        rarity: 'common',
        criteria: { type: 'referral_count', threshold: 1 },
        coinReward: 100,
        order: 1,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Network Builder',
        description: 'Refer 10 friends to ThinkMart',
        icon: '🌐',
        category: 'referral',
        rarity: 'rare',
        criteria: { type: 'referral_count', threshold: 10 },
        coinReward: 500,
        order: 2,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Influencer',
        description: 'Refer 50 friends to ThinkMart',
        icon: '⭐',
        category: 'referral',
        rarity: 'epic',
        criteria: { type: 'referral_count', threshold: 50 },
        coinReward: 2000,
        order: 3,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Legend',
        description: 'Refer 100 friends to ThinkMart',
        icon: '👑',
        category: 'referral',
        rarity: 'legendary',
        criteria: { type: 'referral_count', threshold: 100 },
        coinReward: 5000,
        order: 4,
        isHidden: true,
        isActive: true,
    },

    // Shopping badges
    {
        name: 'First Purchase',
        description: 'Complete your first order',
        icon: '🛒',
        category: 'shopping',
        rarity: 'common',
        criteria: { type: 'order_count', threshold: 1 },
        coinReward: 50,
        order: 10,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Loyal Customer',
        description: 'Complete 10 orders',
        icon: '💎',
        category: 'shopping',
        rarity: 'rare',
        criteria: { type: 'order_count', threshold: 10 },
        coinReward: 300,
        order: 11,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Big Spender',
        description: 'Spend ₹10,000 on ThinkMart',
        icon: '💰',
        category: 'shopping',
        rarity: 'epic',
        criteria: { type: 'total_spent', threshold: 10000 },
        coinReward: 1000,
        order: 12,
        isHidden: false,
        isActive: true,
    },

    // Earning badges
    {
        name: 'First Earnings',
        description: 'Earn your first ₹100',
        icon: '💵',
        category: 'earning',
        rarity: 'common',
        criteria: { type: 'total_earned', threshold: 100 },
        coinReward: 50,
        order: 20,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Money Maker',
        description: 'Earn ₹5,000 total',
        icon: '🤑',
        category: 'earning',
        rarity: 'rare',
        criteria: { type: 'total_earned', threshold: 5000 },
        coinReward: 500,
        order: 21,
        isHidden: false,
        isActive: true,
    },

    // Activity badges
    {
        name: 'Reviewer',
        description: 'Write your first product review',
        icon: '✍️',
        category: 'activity',
        rarity: 'common',
        criteria: { type: 'review_count', threshold: 1 },
        coinReward: 50,
        order: 30,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Critic',
        description: 'Write 10 product reviews',
        icon: '📝',
        category: 'activity',
        rarity: 'rare',
        criteria: { type: 'review_count', threshold: 10 },
        coinReward: 300,
        order: 31,
        isHidden: false,
        isActive: true,
    },
    {
        name: 'Week Warrior',
        description: 'Log in 7 days in a row',
        icon: '🔥',
        category: 'activity',
        rarity: 'rare',
        criteria: { type: 'daily_streak', threshold: 7 },
        coinReward: 200,
        order: 32,
        isHidden: false,
        isActive: true,
    },
];
