'use client';

import { useState, useEffect, useMemo, useCallback } from "react";
import { productService } from "@/services/product.service";
import { Product } from "@/types/product";
import { PublicProductCard } from "@/components/shop/PublicProductCard";
import { ShopFilters, FilterState } from "@/components/shop/ShopFilters";
import { Search, Filter, ShoppingBag, Loader2 } from "lucide-react";

const PAGE_SIZE = 24;

function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export default function PublicShopPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<{ value: number; id: string } | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Filter State
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [filters, setFilters] = useState<FilterState>({
        search: '',
        category: 'all',
        minPrice: '',
        maxPrice: '',
        minCoinPrice: '',
        maxCoinPrice: '',
        inStockOnly: false,
        sort: 'newest'
    });

    const buildRequest = useCallback(
        (cursor: { value: number; id: string } | null) => ({
            pageSize: PAGE_SIZE,
            cursor,
            search: debouncedSearch || undefined,
            category: filters.category !== 'all' ? filters.category : undefined,
            minPrice: parseOptionalNumber(filters.minPrice),
            maxPrice: parseOptionalNumber(filters.maxPrice),
            minCoinPrice: parseOptionalNumber(filters.minCoinPrice),
            maxCoinPrice: parseOptionalNumber(filters.maxCoinPrice),
            inStockOnly: filters.inStockOnly || undefined,
            sort: filters.sort,
        }),
        [debouncedSearch, filters]
    );

    const loadFirstPage = useCallback(async () => {
        setLoading(true);
        try {
            const response = await productService.getShopProductsPage(buildRequest(null));
            setProducts(response.items);
            setNextCursor(response.nextCursor);
            setHasMore(Boolean(response.hasMore && response.nextCursor));
        } catch (error) {
            console.error("Failed to load products", error);
            setProducts([]);
            setNextCursor(null);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [buildRequest]);

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMore || loading) return;

        setLoadingMore(true);
        try {
            const response = await productService.getShopProductsPage(buildRequest(nextCursor));
            setProducts((prev) => {
                const map = new Map(prev.map((item) => [item.id, item]));
                response.items.forEach((item) => map.set(item.id, item));
                return Array.from(map.values());
            });
            setNextCursor(response.nextCursor);
            setHasMore(Boolean(response.hasMore && response.nextCursor));
        } catch (error) {
            console.error("Failed to load more products", error);
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    }, [buildRequest, loading, loadingMore, nextCursor]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
        return () => clearTimeout(timer);
    }, [filters.search]);

    useEffect(() => {
        void loadFirstPage();
    }, [loadFirstPage]);

    const categories = useMemo(() => {
        const cats = new Set(products.map(p => p.category).filter(Boolean));
        return ['all', ...Array.from(cats)];
    }, [products]);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row gap-6">
                {/* Mobile Filter Toggle */}
                <div className="md:hidden flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h1 className="font-bold text-gray-900 flex items-center gap-2">
                        <ShoppingBag className="text-indigo-600" /> Marketplace
                    </h1>
                    <button
                        onClick={() => setShowMobileFilters(true)}
                        className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-gray-700"
                    >
                        <Filter size={20} />
                    </button>
                </div>

                {/* Sidebar Filters */}
                <aside className={`
          fixed inset-y-0 left-0 z-40 w-80 bg-white shadow-xl transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:w-64 md:shadow-none md:bg-transparent
          ${showMobileFilters ? 'translate-x-0' : '-translate-x-full'}
        `}>
                    <div className="h-full md:h-auto overflow-y-auto md:overflow-visible p-4 md:p-0">
                        <ShopFilters
                            filters={filters}
                            setFilters={setFilters}
                            categories={categories}
                            onClose={() => setShowMobileFilters(false)}
                        />
                    </div>
                </aside>

                {/* Overlay for mobile */}
                {showMobileFilters && (
                    <div
                        className="fixed inset-0 bg-black/50 z-30 md:hidden"
                        onClick={() => setShowMobileFilters(false)}
                    />
                )}

                {/* Main Content */}
                <div className="flex-1 space-y-6">
                    {/* Header & Search */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <ShoppingBag className="text-indigo-600" /> Marketplace
                                </h1>
                                <p className="text-gray-500 mt-1">Browse our premium collection available for ThinkMart members.</p>
                            </div>

                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Product Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="bg-white h-96 rounded-2xl shadow-sm animate-pulse border border-gray-100"></div>
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 border-dashed">
                            <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <Search className="text-gray-400" size={32} />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">No products found</h3>
                            <p className="text-gray-500">Try adjusting your filters.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {products.map((product) => (
                                    <PublicProductCard
                                        key={product.id}
                                        product={product}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-center pt-2">
                                <button
                                    type="button"
                                    onClick={loadMore}
                                    disabled={!hasMore || loadingMore}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    {loadingMore && <Loader2 size={16} className="animate-spin" />}
                                    {!hasMore ? 'All products loaded' : loadingMore ? 'Loading...' : 'Load more products'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
