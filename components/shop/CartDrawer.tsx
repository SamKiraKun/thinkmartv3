// File: ThinkMart/components/shop/CartDrawer.tsx
'use client';

import { useCart } from '@/contexts/CartContext';
import { X, ShoppingCart, Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export function CartDrawer() {
    const { items, itemCount, subtotal, coinTotal, removeItem, updateQuantity, clearCart, isOpen, setIsOpen } = useCart();

    const onClose = () => setIsOpen(false);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="text-indigo-600" size={24} />
                        <h2 className="text-xl font-bold text-gray-900">Cart</h2>
                        {itemCount > 0 && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full">
                                {itemCount}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <ShoppingCart size={64} className="text-gray-200 mb-4" />
                            <h3 className="text-lg font-medium text-gray-700">Your cart is empty</h3>
                            <p className="text-gray-500 text-sm mt-1">Add products from the shop</p>
                            <Link
                                href="/dashboard/user/shop"
                                onClick={onClose}
                                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                            >
                                Browse Shop
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map(item => (
                                <div
                                    key={item.productId}
                                    className="flex gap-3 p-3 bg-gray-50 rounded-xl"
                                >
                                    {/* Image */}
                                    <div className="w-20 h-20 bg-white rounded-lg overflow-hidden flex-shrink-0 border">
                                        {item.image ? (
                                            <Image
                                                src={item.image}
                                                alt={item.name}
                                                width={80}
                                                height={80}
                                                className="w-full h-full object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                                <ShoppingCart size={24} className="text-gray-400" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-gray-900 truncate">{item.name}</h4>
                                        <p className="text-indigo-600 font-bold">₹{item.price.toLocaleString('en-IN')}</p>
                                        {item.coinPrice && (
                                            <p className="text-xs text-amber-600">{item.coinPrice.toLocaleString()} coins</p>
                                        )}

                                        {/* Quantity Controls */}
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded-md hover:bg-gray-300 transition"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded-md hover:bg-gray-300 transition"
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button
                                                onClick={() => removeItem(item.productId)}
                                                className="ml-auto p-1.5 text-red-500 hover:bg-red-50 rounded-md transition"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Clear Cart */}
                            {items.length > 1 && (
                                <button
                                    onClick={clearCart}
                                    className="w-full py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                                >
                                    Clear All Items
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer / Checkout */}
                {items.length > 0 && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
                        {/* Totals */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Subtotal ({itemCount} items)</span>
                                <span className="font-bold text-gray-900">₹{subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>Or pay with coins</span>
                                <span className="text-amber-600 font-medium">{coinTotal.toLocaleString()} coins</span>
                            </div>
                        </div>

                        {/* Checkout Button */}
                        <Link
                            href="/dashboard/user/checkout"
                            onClick={onClose}
                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-2"
                        >
                            Proceed to Checkout <ArrowRight size={18} />
                        </Link>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes slide-in-right {
                    from {
                        transform: translateX(100%);
                    }
                    to {
                        transform: translateX(0);
                    }
                }
                .animate-slide-in-right {
                    animation: slide-in-right 0.3s ease-out;
                }
            `}</style>
        </>
    );
}
