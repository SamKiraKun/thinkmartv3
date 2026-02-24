'use client';

/**
 * WishlistButton Component
 * 
 * A heart icon button that toggles wishlist status for a product.
 * Shows filled heart when wishlisted, outline when not.
 */

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { isInWishlist, toggleWishlist, Product } from '@/services/wishlist.service';
import toast from 'react-hot-toast';

interface WishlistButtonProps {
    product: Product;
    className?: string;
    size?: number;
    showLabel?: boolean;
}

export function WishlistButton({
    product,
    className = '',
    size = 24,
    showLabel = false,
}: WishlistButtonProps) {
    const { user } = useAuthStore();
    const [isWishlisted, setIsWishlisted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (user?.uid) {
            isInWishlist(user.uid, product.id).then(setIsWishlisted);
        }
    }, [user?.uid, product.id]);

    const handleToggle = async () => {
        if (!user?.uid) {
            toast.error('Please login to add to wishlist');
            return;
        }

        setIsLoading(true);
        try {
            const result = await toggleWishlist(user.uid, product);
            setIsWishlisted(result.added);
            toast.success(result.added ? 'Added to wishlist' : 'Removed from wishlist');
        } catch (error) {
            toast.error('Failed to update wishlist');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={isLoading}
            className={`flex items-center gap-2 transition-all duration-200 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'
                } ${className}`}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
            <Heart
                size={size}
                className={`transition-colors ${isWishlisted
                    ? 'fill-red-500 text-red-500'
                    : 'fill-transparent text-gray-400 hover:text-red-400'
                    }`}
            />
            {showLabel && (
                <span className="text-sm text-gray-600">
                    {isWishlisted ? 'Wishlisted' : 'Add to Wishlist'}
                </span>
            )}
        </button>
    );
}
