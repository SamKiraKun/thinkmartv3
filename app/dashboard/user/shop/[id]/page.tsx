// File: app/dashboard/user/shop/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { productService } from '@/services/product.service';
import { Product } from '@/types/product';
import { useCart } from '@/contexts/CartContext';
import { useStore } from '@/store/useStore';
import { PurchaseModal } from '@/components/shop/PurchaseModal';
import { ImageCarousel } from '@/components/shop/ImageCarousel';
import { Loader2, ArrowLeft, ShoppingCart, CreditCard, Coins, CheckCircle, AlertTriangle, XCircle, Truck, ShieldCheck, Tag, Wallet } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import Link from 'next/link';

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { addItem, updateQuantity, getItemQuantity, setIsOpen } = useCart();
    const { wallet } = useStore();

    const [product, setProduct] = useState<Product | null>(null);
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

    useEffect(() => {
        if (params.id) {
            loadProduct(params.id as string);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id]);

    const loadProduct = async (id: string) => {
        try {
            const data = await productService.getProduct(id);
            if (!data) {
                toast.error("Product not found");
                router.push('/dashboard/user/shop');
            } else {
                setProduct(data);
                // Load related products
                loadRelatedProducts(data.category, id);
            }
        } catch (error) {
            console.error("Failed to load product", error);
            toast.error("Failed to load product details");
        } finally {
            setLoading(false);
        }
    };

    const loadRelatedProducts = async (category: string, excludeId: string) => {
        try {
            const result = await productService.getShopProductsPage({
                category,
                inStockOnly: true,
                pageSize: 8,
                sort: 'newest',
            });
            const related = result.items
                .filter((p) => p.id !== excludeId)
                .slice(0, 4);
            setRelatedProducts(related);
        } catch (error) {
            console.error("Failed to load related products", error);
        }
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
            </div>
        );
    }

    if (!product) return null;

    const cartQuantity = getItemQuantity(product.id);
    const isLowStock = product.stock !== undefined && product.stock > 0 && product.stock < 10;
    const isOutOfStock = product.stock !== undefined && product.stock <= 0 || !product.inStock;

    // Get images array (support both new images[] and legacy image field)
    const productImages = product.images?.length ? product.images : (product.image ? [product.image] : []);

    const handleAddToCart = () => {
        addItem(product);
        toast.success("Added to cart");
        setIsOpen(true);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition"
            >
                <ArrowLeft size={18} /> Back to Shop
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
                {/* Left: Image Carousel */}
                <div className="space-y-4">
                    <ImageCarousel images={productImages} alt={product.name} />

                    {/* Status Overlay for OOS - shown separately */}
                    {isOutOfStock && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                            <span className="text-red-600 font-bold">OUT OF STOCK</span>
                        </div>
                    )}
                </div>

                {/* Right: Details */}
                <div className="space-y-6">
                    <div>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {product.badges?.map(badge => (
                                <span key={badge} className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-indigo-100 text-indigo-700 flex items-center gap-1">
                                    <Tag size={12} /> {badge}
                                </span>
                            ))}
                            {product.coinOnly && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-yellow-100 text-yellow-700 flex items-center gap-1">
                                    <Coins size={12} /> Coin Exclusive
                                </span>
                            )}
                        </div>

                        <h1 className="text-3xl font-bold text-gray-900 leading-tight">{product.name}</h1>
                        <p className="text-gray-500 mt-2 text-sm">Category: <span className="font-medium text-gray-700 capitalize">{product.category}</span></p>
                    </div>

                    {/* Price Block */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-blue-100/50">
                        <div className="flex items-end gap-3">
                            <span className="text-4xl font-bold text-gray-900">₹{product.price.toLocaleString('en-IN')}</span>
                            {product.coinPrice && (
                                <span className="text-lg font-medium text-yellow-600 flex items-center gap-1 mb-1.5">
                                    or <Coins size={18} /> {product.coinPrice.toLocaleString()}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500">Inclusive of all taxes</p>
                    </div>

                    {/* Stock Status */}
                    <div className="flex items-center gap-3 py-2 border-y border-gray-100">
                        {isOutOfStock ? (
                            <span className="flex items-center gap-1.5 text-red-600 font-medium">
                                <XCircle size={18} /> Out of Stock
                            </span>
                        ) : isLowStock ? (
                            <span className="flex items-center gap-1.5 text-orange-600 font-medium">
                                <AlertTriangle size={18} /> Low Stock: Only {product.stock} left
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-green-600 font-medium">
                                <CheckCircle size={18} /> In Stock
                            </span>
                        )}

                        {product.deliveryDays && (
                            <>
                                <span className="text-gray-300">|</span>
                                <span className="flex items-center gap-1.5 text-gray-600 text-sm">
                                    <Truck size={16} /> Delivers in {product.deliveryDays} days
                                </span>
                            </>
                        )}
                    </div>

                    {/* Description */}
                    <div className="prose prose-sm text-gray-600">
                        <p>{product.description}</p>
                    </div>

                    {/* Vendor Info (if any) */}
                    {product.vendor && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-2 rounded-lg inline-block">
                            <ShieldCheck size={16} className="text-indigo-500" />
                            Sold by: <span className="font-medium text-gray-700">{product.vendor}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 space-y-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={handleAddToCart}
                                disabled={isOutOfStock}
                                className="flex-1 bg-white border-2 border-indigo-600 text-indigo-700 py-3.5 px-6 rounded-xl font-bold hover:bg-indigo-50 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ShoppingCart size={20} />
                                {cartQuantity > 0 ? `In Cart (${cartQuantity})` : 'Add to Cart'}
                            </button>

                            <button
                                onClick={() => setPurchaseModalOpen(true)}
                                disabled={isOutOfStock}
                                className="flex-1 bg-indigo-600 text-white py-3.5 px-6 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CreditCard size={20} />
                                Buy Now
                            </button>
                        </div>

                        {/* Balance Check */}
                        <div className="flex gap-4 text-xs">
                            <div className={`flex items-center gap-1 ${wallet?.coinBalance && product.coinPrice && wallet.coinBalance >= product.coinPrice ? 'text-green-600' : 'text-orange-500'}`}>
                                <Coins size={14} />
                                <span>Coins: {wallet?.coinBalance?.toLocaleString() || 0}</span>
                            </div>
                            <div className={`flex items-center gap-1 ${wallet?.cashBalance && wallet.cashBalance >= product.price ? 'text-green-600' : 'text-orange-500'}`}>
                                <Wallet size={14} />
                                <span>Cash: ₹{wallet?.cashBalance?.toLocaleString('en-IN') || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Related Products Section */}
            {relatedProducts.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">You might also like</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {relatedProducts.map(rp => (
                            <Link
                                key={rp.id}
                                href={`/dashboard/user/shop/${rp.id}`}
                                className="group rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition"
                            >
                                <div className="aspect-square bg-gray-100 overflow-hidden">
                                    {rp.images?.[0] || rp.image ? (
                                        <Image
                                            src={rp.images?.[0] || rp.image}
                                            alt={rp.name}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                            <ShoppingCart size={32} />
                                        </div>
                                    )}
                                </div>
                                <div className="p-3">
                                    <h3 className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-indigo-600 transition">
                                        {rp.name}
                                    </h3>
                                    <p className="text-indigo-600 font-bold mt-1">
                                        ₹{rp.price.toLocaleString('en-IN')}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Purchase Modal (Direct Buy) */}
            <PurchaseModal
                isOpen={purchaseModalOpen}
                onClose={() => setPurchaseModalOpen(false)}
                product={product}
            />
            <Toaster position="bottom-center" />
        </div>
    );
}
