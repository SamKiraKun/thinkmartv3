// File: ThinkMart/components/shop/ProductCard.tsx
'use client';

import Image from "next/image";
import { Product } from "@/types/product";
import { useCart } from "@/contexts/CartContext";
import { ShoppingCart, Coins, Check, Plus, Flame, Sparkles, Star, Award } from "lucide-react";

interface ProductCardProps {
  product: Product;
  onBuy: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onBuy }) => {
  const { addItem, isInCart, getItemQuantity } = useCart();
  const inCart = isInCart(product.id);
  const quantity = getItemQuantity(product.id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product);
  };

  // Badge config
  const badgeIcons: Record<string, React.ReactNode> = {
    'popular': <Flame size={10} />,
    'new': <Sparkles size={10} />,
    'bestseller': <Star size={10} />,
    'featured': <Award size={10} />,
  };

  const badgeColors: Record<string, string> = {
    'popular': 'bg-orange-100 text-orange-700',
    'new': 'bg-blue-100 text-blue-700',
    'bestseller': 'bg-amber-100 text-amber-700',
    'coin-only': 'bg-yellow-100 text-yellow-700',
    'cash-only': 'bg-green-100 text-green-700',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group flex flex-col h-full">
      {/* Image Container */}
      <div className="relative h-48 bg-gray-50 overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          unoptimized
        />

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {product.badges?.map(badge => (
            <span
              key={badge}
              className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${badgeColors[badge] || 'bg-gray-100 text-gray-700'}`}
            >
              {badgeIcons[badge]} {badge.charAt(0).toUpperCase() + badge.slice(1).replace('-', ' ')}
            </span>
          ))}
        </div>

        {/* Commission Badge */}
        <div className="absolute top-2 right-2 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full shadow-sm">
          Earn ₹{product.commission}
        </div>

        {/* Stock Status */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
            {product.category}
          </span>
          {product.stock !== undefined && product.stock < 10 && product.inStock && (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">
              Only {product.stock} left!
            </span>
          )}
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1 line-clamp-1" title={product.name}>
          {product.name}
        </h3>
        <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-1">
          {product.description}
        </p>

        {/* Pricing & Actions */}
        <div className="flex items-center justify-between mt-auto">
          <div>
            <div className="text-xl font-bold text-gray-900">
              ₹{product.price.toLocaleString('en-IN')}
            </div>
            {product.coinPrice && (
              <div className="text-xs text-yellow-600 font-medium flex items-center gap-1">
                <Coins size={12} /> {product.coinPrice.toLocaleString()} Coins
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Add to Cart */}
            <button
              onClick={handleAddToCart}
              disabled={!product.inStock}
              className={`p-2 rounded-lg transition shadow-sm active:scale-95 flex items-center gap-1 ${inCart
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${!product.inStock ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={inCart ? `In Cart (${quantity})` : 'Add to Cart'}
            >
              {inCart ? <Check size={18} /> : <Plus size={18} />}
              {inCart && <span className="text-xs font-bold">{quantity}</span>}
            </button>

            {/* Buy Now */}
            <button
              onClick={() => onBuy(product)}
              disabled={!product.inStock}
              className={`p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm active:scale-95 ${!product.inStock ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              title="Buy Now"
            >
              <ShoppingCart size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
