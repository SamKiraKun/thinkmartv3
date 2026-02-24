// File: services/search.service.ts
/**
 * Product Search Service
 * 
 * Client-side search using Typesense.
 * Typesense provides fast, typo-tolerant search with faceted filtering.
 */

import { Client } from 'typesense';
import type { ProductDocument, SearchFilters, SearchOptions, SearchResult } from '@/types/search';

// ============================================================================
// CLIENT SINGLETON
// ============================================================================

let typesenseClient: Client | null = null;
let clientInitialized = false;

/**
 * Initialize Typesense client using public search-only environment variables.
 * Expected envs:
 * - NEXT_PUBLIC_TYPESENSE_HOST
 * - NEXT_PUBLIC_TYPESENSE_PORT (optional, default 443)
 * - NEXT_PUBLIC_TYPESENSE_PROTOCOL (optional, default https)
 * - NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY
 */
async function getClient(): Promise<Client | null> {
    if (typesenseClient) return typesenseClient;
    if (clientInitialized) return null; // Already tried, failed

    try {
        const config = {
            host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || '',
            port: Number(process.env.NEXT_PUBLIC_TYPESENSE_PORT || 443),
            protocol: (process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https') as 'http' | 'https',
            apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY || '',
        };

        if (!config.apiKey || !config.host) {
            console.warn('[search] Search API key not available');
            clientInitialized = true;
            return null;
        }

        typesenseClient = new Client({
            nodes: [{
                host: config.host,
                port: config.port,
                protocol: config.protocol as 'http' | 'https',
            }],
            apiKey: config.apiKey,
            connectionTimeoutSeconds: 5,
        });

        clientInitialized = true;
        return typesenseClient;
    } catch (error) {
        console.warn('[search] Failed to initialize search client:', error);
        clientInitialized = true;
        return null;
    }
}

// ============================================================================
// SEARCH PRODUCTS
// ============================================================================

/**
 * Search products with filters, pagination, and sorting
 */
export async function searchProducts(
    options: SearchOptions
): Promise<SearchResult<ProductDocument>> {
    const client = await getClient();

    // Fallback to empty results if Typesense not available
    if (!client) {
        return {
            hits: [],
            found: 0,
            page: 1,
            totalPages: 0,
            searchTimeMs: 0,
        };
    }

    const {
        query,
        filters = {},
        page = 1,
        perPage = 20,
        sortBy = 'relevance',
    } = options;

    // Build filter string
    const filterClauses: string[] = [];

    if (filters.category) {
        filterClauses.push(`category:=${filters.category}`);
    }
    if (filters.brand) {
        filterClauses.push(`brand:=${filters.brand}`);
    }
    if (filters.inStock) {
        filterClauses.push(`inStock:=true`);
    }
    if (filters.minPrice !== undefined) {
        filterClauses.push(`price:>=${filters.minPrice}`);
    }
    if (filters.maxPrice !== undefined) {
        filterClauses.push(`price:<=${filters.maxPrice}`);
    }
    if (filters.minRating !== undefined) {
        filterClauses.push(`rating:>=${filters.minRating}`);
    }

    // Build sort string
    let sortByStr = '_text_match:desc'; // Default: relevance
    switch (sortBy) {
        case 'price_asc':
            sortByStr = 'price:asc';
            break;
        case 'price_desc':
            sortByStr = 'price:desc';
            break;
        case 'newest':
            sortByStr = 'createdAt:desc';
            break;
        case 'rating':
            sortByStr = 'rating:desc,reviewCount:desc';
            break;
    }

    try {
        const searchResult = await client.collections('products').documents().search({
            q: query || '*',
            query_by: 'name,description,category,tags',
            filter_by: filterClauses.join(' && ') || undefined,
            sort_by: sortByStr,
            page,
            per_page: perPage,
            highlight_full_fields: 'name,description',
        });

        const hits = (searchResult.hits || []).map((hit) => {
            const doc = hit.document as ProductDocument;
            return {
                ...doc,
                // Add highlighted fields if available
                _highlights: hit.highlights,
            };
        });

        return {
            hits,
            found: searchResult.found || 0,
            page: searchResult.page || 1,
            totalPages: Math.ceil((searchResult.found || 0) / perPage),
            searchTimeMs: searchResult.search_time_ms || 0,
        };
    } catch (error) {
        console.error('[search] Search error:', error);
        return {
            hits: [],
            found: 0,
            page: 1,
            totalPages: 0,
            searchTimeMs: 0,
        };
    }
}

// ============================================================================
// SEARCH SUGGESTIONS (Autocomplete)
// ============================================================================

/**
 * Get search suggestions as user types
 */
export async function getSuggestions(
    query: string,
    limit = 5
): Promise<{ text: string; highlighted: string }[]> {
    const client = await getClient();

    if (!client || !query || query.length < 2) {
        return [];
    }

    try {
        const result = await client.collections('products').documents().search({
            q: query,
            query_by: 'name',
            per_page: limit,
            highlight_full_fields: 'name',
        });

        return (result.hits || []).map((hit) => ({
            text: (hit.document as ProductDocument).name,
            highlighted: hit.highlights?.[0]?.snippet || (hit.document as ProductDocument).name,
        }));
    } catch (error) {
        console.error('[search] Suggestion error:', error);
        return [];
    }
}

// ============================================================================
// GET FACETS (For filter options)
// ============================================================================

/**
 * Get available filter options (categories, brands, price ranges)
 */
export async function getSearchFacets(): Promise<{
    categories: string[];
    brands: string[];
    priceRange: { min: number; max: number };
}> {
    const client = await getClient();

    if (!client) {
        return { categories: [], brands: [], priceRange: { min: 0, max: 0 } };
    }

    try {
        const result = await client.collections('products').documents().search({
            q: '*',
            query_by: 'name',
            facet_by: 'category,brand',
            max_facet_values: 50,
            per_page: 0, // We only want facets, not documents
        });

        const categories = (result.facet_counts?.find(f => f.field_name === 'category')?.counts || [])
            .map(c => c.value);

        const brands = (result.facet_counts?.find(f => f.field_name === 'brand')?.counts || [])
            .map(c => c.value);

        // Get price range from stats (if available) or use defaults
        // Note: Would need a separate aggregation query for accurate min/max

        return {
            categories,
            brands,
            priceRange: { min: 0, max: 100000 },
        };
    } catch (error) {
        console.error('[search] Facets error:', error);
        return { categories: [], brands: [], priceRange: { min: 0, max: 0 } };
    }
}

// ============================================================================
// CHECK IF SEARCH IS AVAILABLE
// ============================================================================

/**
 * Check if Typesense search is configured and available
 */
export async function isSearchAvailable(): Promise<boolean> {
    const client = await getClient();
    return client !== null;
}
