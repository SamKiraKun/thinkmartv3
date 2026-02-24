// File: components/shop/ShopFilters.tsx
import { Filter, X } from "lucide-react";

export interface FilterState {
    search: string;
    category: string;
    minPrice: string;
    maxPrice: string;
    minCoinPrice: string;
    maxCoinPrice: string;
    inStockOnly: boolean;
    sort: 'newest' | 'price_asc' | 'price_desc';
}

interface ShopFiltersProps {
    filters: FilterState;
    setFilters: (filters: FilterState) => void;
    categories: string[];
    onClose?: () => void; // For mobile drawer
}

export function ShopFilters({ filters, setFilters, categories, onClose }: ShopFiltersProps) {
    const handleChange = (key: keyof FilterState, value: any) => {
        setFilters({ ...filters, [key]: value });
    };

    const resetFilters = () => {
        setFilters({
            search: '',
            category: 'all',
            minPrice: '',
            maxPrice: '',
            minCoinPrice: '',
            maxCoinPrice: '',
            inStockOnly: false,
            sort: 'newest'
        });
        if (onClose) onClose();
    };

    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Filter size={18} /> Filters
                </h3>
                {onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full md:hidden">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Sort */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Sort By</label>
                <select
                    value={filters.sort}
                    onChange={(e) => handleChange('sort', e.target.value)}
                    className="w-full p-2 border rounded-lg text-sm"
                >
                    <option value="newest">Newest Arrivals</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                </select>
            </div>

            {/* Price Range */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Price Range (₹)</label>
                <div className="flex gap-2">
                    <input
                        type="number"
                        placeholder="Min"
                        value={filters.minPrice}
                        onChange={(e) => handleChange('minPrice', e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                    />
                    <input
                        type="number"
                        placeholder="Max"
                        value={filters.maxPrice}
                        onChange={(e) => handleChange('maxPrice', e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                    />
                </div>
            </div>

            {/* Coin Price Range */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Coin Price Range</label>
                <div className="flex gap-2">
                    <input
                        type="number"
                        placeholder="Min"
                        value={filters.minCoinPrice}
                        onChange={(e) => handleChange('minCoinPrice', e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                    />
                    <input
                        type="number"
                        placeholder="Max"
                        value={filters.maxCoinPrice}
                        onChange={(e) => handleChange('maxCoinPrice', e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                    />
                </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Category</label>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {categories.map(cat => (
                        <label key={cat} className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="category"
                                value={cat}
                                checked={filters.category === cat}
                                onChange={(e) => handleChange('category', e.target.value)}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-600 capitalize">{cat}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Stock */}
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={filters.inStockOnly}
                    onChange={(e) => handleChange('inStockOnly', e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">In Stock Only</span>
            </label>

            {/* Actions */}
            <div className="pt-2">
                <button
                    onClick={resetFilters}
                    className="w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                    Reset Filters
                </button>
            </div>
        </div>
    );
}
