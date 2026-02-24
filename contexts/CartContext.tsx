// File: ThinkMart/contexts/CartContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Product } from '@/types/product';

// Cart item includes product info + quantity
export interface CartItem {
    productId: string;
    name: string;
    image: string;
    price: number;          // Cash price
    coinPrice?: number;     // Coin price if available
    quantity: number;
    inStock: boolean;
}

interface CartContextType {
    items: CartItem[];
    itemCount: number;
    subtotal: number;       // Total in cash
    coinTotal: number;      // Total if paid in coins
    addItem: (product: Product, quantity?: number) => void;
    removeItem: (productId: string) => void;
    updateQuantity: (productId: string, quantity: number) => void;
    clearCart: () => void;
    isInCart: (productId: string) => boolean;
    getItemQuantity: (productId: string) => number;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'thinkmart_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);
    const [isOpen, setIsOpen] = useState(false); // NEW: UI Control

    // Load cart from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(CART_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    setItems(parsed);
                }
            }
        } catch (e) {
            console.error('Failed to load cart from storage:', e);
        }
        setIsHydrated(true);
    }, []);

    // Save to localStorage whenever items change (after hydration)
    useEffect(() => {
        if (isHydrated) {
            try {
                localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
            } catch (e) {
                console.error('Failed to save cart to storage:', e);
            }
        }
    }, [items, isHydrated]);

    const addItem = useCallback((product: Product, quantity: number = 1) => {
        setItems(prev => {
            const existing = prev.find(item => item.productId === product.id);
            if (existing) {
                // Update quantity
                return prev.map(item =>
                    item.productId === product.id
                        ? { ...item, quantity: item.quantity + quantity }
                        : item
                );
            }
            // Add new item
            return [...prev, {
                productId: product.id,
                name: product.name,
                image: product.image,
                price: product.price,
                coinPrice: product.coinPrice,
                quantity,
                inStock: product.inStock
            }];
        });
    }, []);

    const removeItem = useCallback((productId: string) => {
        setItems(prev => prev.filter(item => item.productId !== productId));
    }, []);

    const updateQuantity = useCallback((productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeItem(productId);
            return;
        }
        setItems(prev =>
            prev.map(item =>
                item.productId === productId
                    ? { ...item, quantity }
                    : item
            )
        );
    }, [removeItem]);

    const clearCart = useCallback(() => {
        setItems([]);
    }, []);

    const isInCart = useCallback((productId: string) => {
        return items.some(item => item.productId === productId);
    }, [items]);

    const getItemQuantity = useCallback((productId: string) => {
        const item = items.find(i => i.productId === productId);
        return item?.quantity || 0;
    }, [items]);

    // Computed values
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const coinTotal = items.reduce((sum, item) => {
        const coinPrice = item.coinPrice || Math.floor(item.price * 1000); // Default: 1 rupee = 1000 coins
        return sum + (coinPrice * item.quantity);
    }, 0);

    return (
        <CartContext.Provider value={{
            items,
            itemCount,
            subtotal,
            coinTotal,
            addItem,
            removeItem,
            updateQuantity,
            clearCart,
            isInCart,
            getItemQuantity,
            isOpen,
            setIsOpen
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within CartProvider');
    }
    return context;
}
