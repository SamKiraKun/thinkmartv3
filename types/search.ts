// File: types/search.ts
/**
 * Product Search Types
 * 
 * Types for Typesense-powered product search functionality.
 * Typesense is a fast, typo-tolerant, open-source search engine.
 */

export interface SearchConfig {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    apiKey: string; // Search-only API key (safe for client)
}

export interface ProductDocument {
    id: string;
    name: string;
    description: string;
    price: number;
    coinPrice?: number;
    category: string;
    brand?: string;
    tags: string[];
    image: string;
    inStock: boolean;
    rating: number;
    reviewCount: number;
    vendor?: string;
    createdAt: number; // Unix timestamp for sorting
}

export interface SearchFilters {
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    minRating?: number;
}

export interface SearchOptions {
    query: string;
    filters?: SearchFilters;
    page?: number;
    perPage?: number;
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';
}

export interface SearchResult<T> {
    hits: T[];
    found: number;
    page: number;
    totalPages: number;
    searchTimeMs: number;
}

export interface SearchSuggestion {
    text: string;
    highlighted: string;
    document?: ProductDocument;
}

// Typesense Collection Schema
export const PRODUCT_SCHEMA = {
    name: 'products',
    fields: [
        { name: 'id', type: 'string' as const },
        { name: 'name', type: 'string' as const },
        { name: 'description', type: 'string' as const },
        { name: 'price', type: 'float' as const },
        { name: 'coinPrice', type: 'int32' as const, optional: true },
        { name: 'category', type: 'string' as const, facet: true },
        { name: 'brand', type: 'string' as const, facet: true, optional: true },
        { name: 'tags', type: 'string[]' as const },
        { name: 'image', type: 'string' as const },
        { name: 'inStock', type: 'bool' as const, facet: true },
        { name: 'rating', type: 'float' as const },
        { name: 'reviewCount', type: 'int32' as const },
        { name: 'vendor', type: 'string' as const, optional: true },
        { name: 'createdAt', type: 'int64' as const },
    ],
    default_sorting_field: 'createdAt',
};
