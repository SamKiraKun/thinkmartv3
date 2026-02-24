import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { z } from "zod";
import { withValidation } from "../lib/validation";

const db = admin.firestore();

const ShopCursorSchema = z.object({
    value: z.number(),
    id: z.string().min(1).max(128),
});

const GetShopProductsPageSchema = z.object({
    pageSize: z.number().int().min(1).max(60).default(24),
    cursor: ShopCursorSchema.nullable().optional(),
    search: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
    minCoinPrice: z.number().nonnegative().optional(),
    maxCoinPrice: z.number().nonnegative().optional(),
    inStockOnly: z.boolean().optional(),
    sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
});

interface ShopCursor {
    value: number;
    id: string;
}

interface ShopProductItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image: string;
    images: string[];
    commission: number;
    coinPrice: number | null;
    inStock: boolean;
    stock: number | null;
    badges: string[];
    coinOnly: boolean;
    cashOnly: boolean;
    deliveryDays: number | null;
    vendor: string | null;
    status: string | null;
    isActive: boolean | null;
    isDeleted?: boolean;
    createdAt: unknown;
    updatedAt: unknown;
}

type SortKey = "newest" | "price_asc" | "price_desc";

function toMillis(value: unknown): number {
    if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }

    if (
        value &&
        typeof (value as { seconds?: unknown }).seconds === "number"
    ) {
        return Number((value as { seconds: number }).seconds) * 1000;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    return 0;
}

function getSortConfig(sort: SortKey): {
    field: "createdAt" | "price";
    direction: FirebaseFirestore.OrderByDirection;
} {
    if (sort === "price_asc") {
        return { field: "price", direction: "asc" };
    }

    if (sort === "price_desc") {
        return { field: "price", direction: "desc" };
    }

    return { field: "createdAt", direction: "desc" };
}

function getCursorValue(data: FirebaseFirestore.DocumentData, field: "createdAt" | "price"): number {
    if (field === "price") {
        return Number(data.price || 0);
    }

    return toMillis(data.createdAt);
}

function normalizeProduct(doc: FirebaseFirestore.QueryDocumentSnapshot): ShopProductItem {
    const data = doc.data();
    const images = Array.isArray(data.images)
        ? data.images.filter((url: unknown) => typeof url === "string" && url.length > 0)
        : [];
    const primaryImage = typeof data.image === "string" && data.image.length > 0
        ? data.image
        : images[0] || "";
    const stock = typeof data.stock === "number" ? data.stock : null;

    return {
        id: doc.id,
        name: data.name || "",
        description: data.description || "",
        price: Number(data.price || 0),
        category: data.category || "",
        image: primaryImage,
        images,
        commission: Number(data.commission || 0),
        coinPrice: typeof data.coinPrice === "number" ? data.coinPrice : null,
        inStock: typeof data.inStock === "boolean" ? data.inStock : (stock !== null ? stock > 0 : true),
        stock,
        badges: Array.isArray(data.badges) ? data.badges : [],
        coinOnly: Boolean(data.coinOnly),
        cashOnly: Boolean(data.cashOnly),
        deliveryDays: typeof data.deliveryDays === "number" ? data.deliveryDays : null,
        vendor: typeof data.vendor === "string" ? data.vendor : null,
        status: typeof data.status === "string" ? data.status : null,
        isActive: typeof data.isActive === "boolean" ? data.isActive : null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
    };
}

function matchesInMemoryFilters(
    product: ShopProductItem,
    search: string | undefined,
    minCoinPrice: number | undefined,
    maxCoinPrice: number | undefined,
    inStockOnly: boolean
): boolean {
    if (product.inStock === false) {
        return false;
    }
    if (product.isDeleted) {
        return false;
    }

    // Only show products that are approved (or legacy products with no status that are explicitly active)
    if (product.status) {
        const normalizedStatus = product.status.toLowerCase();
        const visibleStatuses = new Set(["approved", "active", "published", "live"]);
        if (!visibleStatuses.has(normalizedStatus)) {
            return false;
        }
    } else {
        // Legacy products without a status field: only show if explicitly active
        if (product.isActive === false) {
            return false;
        }
    }

    if (product.isActive === false) {
        return false;
    }

    if (inStockOnly) {
        const stockTracked = typeof product.stock === "number";
        if (stockTracked && Number(product.stock) <= 0) {
            return false;
        }
    }

    if (search) {
        const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) {
            return false;
        }
    }

    if (minCoinPrice !== undefined) {
        if (typeof product.coinPrice !== "number" || product.coinPrice < minCoinPrice) {
            return false;
        }
    }

    if (maxCoinPrice !== undefined) {
        if (typeof product.coinPrice !== "number" || product.coinPrice > maxCoinPrice) {
            return false;
        }
    }

    return true;
}

export const getShopProductsPage = functions.https.onCall(
    withValidation(GetShopProductsPageSchema, async (data, context) => {
        const {
            pageSize,
            cursor,
            search,
            category,
            minPrice,
            maxPrice,
            minCoinPrice,
            maxCoinPrice,
            inStockOnly = false,
            sort = "newest",
        } = data;
        const effectivePageSize = pageSize ?? 24;

        if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
            throw new functions.https.HttpsError("invalid-argument", "minPrice cannot be greater than maxPrice");
        }
        if (
            minCoinPrice !== undefined &&
            maxCoinPrice !== undefined &&
            minCoinPrice > maxCoinPrice
        ) {
            throw new functions.https.HttpsError("invalid-argument", "minCoinPrice cannot be greater than maxCoinPrice");
        }

        const sortConfig = getSortConfig(sort);

        let baseQuery: FirebaseFirestore.Query = db.collection("products");

        if (category) {
            baseQuery = baseQuery.where("category", "==", category);
        }
        if (minPrice !== undefined) {
            baseQuery = baseQuery.where("price", ">=", minPrice);
        }
        if (maxPrice !== undefined) {
            baseQuery = baseQuery.where("price", "<=", maxPrice);
        }

        const orderedBase = baseQuery
            .orderBy(sortConfig.field, sortConfig.direction)
            .orderBy(admin.firestore.FieldPath.documentId(), sortConfig.direction);

        let scanQuery = orderedBase;
        if (cursor) {
            scanQuery = scanQuery.startAfter(cursor.value, cursor.id);
        }

        const scanLimit = Math.min(Math.max(effectivePageSize * 3, 30), 120);
        const maxScans = 5;
        let scans = 0;

        const matched: Array<{ item: ShopProductItem; cursor: ShopCursor }> = [];

        while (scans < maxScans && matched.length <= effectivePageSize) {
            const snapshot = await scanQuery.limit(scanLimit).get();
            if (snapshot.empty) {
                break;
            }

            for (const doc of snapshot.docs) {
                const item = normalizeProduct(doc);
                if (
                    matchesInMemoryFilters(
                        item,
                        search,
                        minCoinPrice,
                        maxCoinPrice,
                        inStockOnly
                    )
                ) {
                    matched.push({
                        item,
                        cursor: {
                            value: getCursorValue(doc.data(), sortConfig.field),
                            id: doc.id,
                        },
                    });

                    if (matched.length > effectivePageSize) {
                        break;
                    }
                }
            }

            if (matched.length > effectivePageSize || snapshot.docs.length < scanLimit) {
                break;
            }

            const lastDoc = snapshot.docs[snapshot.docs.length - 1];
            scanQuery = orderedBase.startAfter(
                getCursorValue(lastDoc.data(), sortConfig.field),
                lastDoc.id
            );
            scans += 1;
        }

        const hasMore = matched.length > effectivePageSize;
        const page = matched.slice(0, effectivePageSize);
        const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].cursor : null;

        return {
            items: page.map((entry) => entry.item),
            nextCursor,
            hasMore,
        };
    })
);
