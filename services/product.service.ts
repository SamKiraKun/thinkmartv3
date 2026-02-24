import { apiClient } from '@/lib/api/client';
import { auth } from '@/lib/firebase/config';
import {
  fetchProducts,
  fetchProduct,
  createProduct as createProductApi,
  updateProduct as updateProductApi,
  deleteProduct as deleteProductApi,
} from '@/services/productService';
import { Product } from '@/types/product';

const PUBLIC_R2_BASE =
  (process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '');

export interface ShopProductsCursor {
  value: number;
  id: string;
}

export interface GetShopProductsPageRequest {
  pageSize?: number;
  cursor?: ShopProductsCursor | null;
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minCoinPrice?: number;
  maxCoinPrice?: number;
  inStockOnly?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

export interface GetShopProductsPageResponse {
  items: Product[];
  nextCursor: ShopProductsCursor | null;
  hasMore: boolean;
}

function toProduct(api: any): Product {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    price: Number(api.price || 0),
    category: api.category,
    image: api.image || api.images?.[0] || '',
    images: Array.isArray(api.images) ? api.images : [],
    commission: Number(api.commission || 0),
    coinPrice: Number(api.coinPrice || 0),
    inStock: Boolean(api.inStock),
    stock: typeof api.stock === 'number' ? api.stock : Number(api.stock || 0),
    badges: Array.isArray(api.badges) ? api.badges : [],
    coinOnly: Boolean(api.coinOnly),
    cashOnly: Boolean(api.cashOnly),
    deliveryDays: Number(api.deliveryDays || 0),
    vendor: api.vendor,
    createdAt: api.createdAt || new Date().toISOString(),
    updatedAt: api.updatedAt || new Date().toISOString(),
  } as Product;
}

async function uploadProductImage(file: File, uid: string): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const presign = await apiClient.post<any>('/api/storage/presign', {
    filename: file.name,
    contentType,
    folder: `products/${uid}`,
  });
  const payload = presign.data?.data || presign.data || presign;
  const uploadUrl = payload.uploadUrl;
  const key = payload.key;
  if (!uploadUrl || !key) {
    throw new Error('Invalid upload presign response');
  }

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!uploadRes.ok) {
    throw new Error('Image upload failed');
  }

  if (PUBLIC_R2_BASE) {
    return `${PUBLIC_R2_BASE}/${key}`;
  }
  return `https://pub-mock-thinkmart.r2.dev/${key}`;
}

export const productService = {
  async getAllProducts(): Promise<Product[]> {
    const res = await fetchProducts({}, 1, 500);
    return res.data.map(toProduct);
  },

  async getActiveProducts(): Promise<Product[]> {
    const res = await fetchProducts({ inStock: true }, 1, 500);
    return res.data.map(toProduct);
  },

  async getShopProductsPage(input: GetShopProductsPageRequest): Promise<GetShopProductsPageResponse> {
    const pageSize = Math.max(1, input.pageSize || 24);
    const page = Math.max(1, (input.cursor?.value || 0) + 1);

    const sortMap: Record<string, { sortBy?: string; sortOrder?: 'asc' | 'desc' }> = {
      newest: { sortBy: 'created_at', sortOrder: 'desc' },
      price_asc: { sortBy: 'price', sortOrder: 'asc' },
      price_desc: { sortBy: 'price', sortOrder: 'desc' },
    };

    const res = await fetchProducts(
      {
        category: input.category,
        search: input.search,
        inStock: input.inStockOnly,
        ...sortMap[input.sort || 'newest'],
      },
      page,
      pageSize
    );

    const items = res.data
      .filter((p) => (input.minPrice === undefined ? true : Number(p.price) >= input.minPrice))
      .filter((p) => (input.maxPrice === undefined ? true : Number(p.price) <= input.maxPrice))
      .filter((p) => (input.minCoinPrice === undefined ? true : Number(p.coinPrice || 0) >= input.minCoinPrice))
      .filter((p) => (input.maxCoinPrice === undefined ? true : Number(p.coinPrice || 0) <= input.maxCoinPrice))
      .map(toProduct);

    return {
      items,
      hasMore: res.pagination.hasNext,
      nextCursor: res.pagination.hasNext ? { value: page, id: items[items.length - 1]?.id || '' } : null,
    };
  },

  async getProduct(id: string): Promise<Product | null> {
    const product = await fetchProduct(id);
    return product ? toProduct(product) : null;
  },

  async addProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'image'>,
    imageFile: File
  ): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error('Authentication required');
    }

    const imageUrl = await uploadProductImage(imageFile, uid);
    const result = await createProductApi({
      name: productData.name,
      description: productData.description,
      price: Number(productData.price || 0),
      category: productData.category,
      image: imageUrl,
      images: [imageUrl],
      commission: Number(productData.commission || 0),
      coinPrice: Number(productData.coinPrice || 0),
      stock: productData.stock ?? (productData.inStock ? 1 : 0),
      badges: productData.badges,
      coinOnly: productData.coinOnly,
      cashOnly: productData.cashOnly,
      deliveryDays: productData.deliveryDays,
    });
    return result.id;
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    await updateProductApi(id, {
      name: updates.name,
      description: updates.description,
      price: updates.price,
      category: updates.category,
      image: updates.image,
      images: updates.images,
      commission: updates.commission,
      coinPrice: updates.coinPrice,
      stock: updates.stock,
      badges: updates.badges,
      coinOnly: updates.coinOnly,
      cashOnly: updates.cashOnly,
      deliveryDays: updates.deliveryDays,
    });
  },

  async deleteProduct(id: string): Promise<void> {
    await deleteProductApi(id);
  },
};
