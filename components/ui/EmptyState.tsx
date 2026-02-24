'use client';

/**
 * EmptyState Component
 * 
 * Reusable empty state with illustration, title, description, and optional action.
 */

import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className = '',
}: EmptyStateProps) {
    return (
        <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                <Icon size={40} className="text-gray-400" />
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-2 text-center">
                {title}
            </h3>

            <p className="text-gray-500 text-center max-w-md mb-6">
                {description}
            </p>

            {action && (
                <button
                    onClick={action.onClick}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}

/**
 * Pre-built empty states for common scenarios
 */

interface CommonEmptyStateProps {
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function EmptyOrders({ action }: CommonEmptyStateProps) {
    return (
        <EmptyState
            icon={require('lucide-react').ShoppingCart}
            title="No Orders Yet"
            description="When you place an order, it will appear here. Start shopping to see your orders!"
            action={action}
        />
    );
}

export function EmptyProducts({ action }: CommonEmptyStateProps) {
    return (
        <EmptyState
            icon={require('lucide-react').Package}
            title="No Products Found"
            description="There are no products to display. Check back later or try a different category."
            action={action}
        />
    );
}

export function EmptyWishlist({ action }: CommonEmptyStateProps) {
    return (
        <EmptyState
            icon={require('lucide-react').Heart}
            title="Your Wishlist is Empty"
            description="Save products you love to your wishlist. Tap the heart icon on any product to add it."
            action={action}
        />
    );
}

export function EmptyNotifications() {
    return (
        <EmptyState
            icon={require('lucide-react').Bell}
            title="No Notifications"
            description="You're all caught up! Notifications about orders, rewards, and updates will appear here."
        />
    );
}

export function EmptyTransactions() {
    return (
        <EmptyState
            icon={require('lucide-react').Receipt}
            title="No Transactions"
            description="Your transaction history is empty. Complete tasks, make purchases, or earn referrals to see activity."
        />
    );
}

export function EmptyReviews({ action }: CommonEmptyStateProps) {
    return (
        <EmptyState
            icon={require('lucide-react').Star}
            title="No Reviews Yet"
            description="This product doesn't have any reviews yet. Be the first to share your experience!"
            action={action}
        />
    );
}

export function EmptySearch({ action }: CommonEmptyStateProps) {
    return (
        <EmptyState
            icon={require('lucide-react').Search}
            title="No Results Found"
            description="We couldn't find anything matching your search. Try different keywords or browse categories."
            action={action}
        />
    );
}

export function EmptyReferrals({ action }: CommonEmptyStateProps) {
    return (
        <EmptyState
            icon={require('lucide-react').Users}
            title="No Referrals Yet"
            description="Share your referral code with friends and earn rewards when they join ThinkMart!"
            action={action}
        />
    );
}
