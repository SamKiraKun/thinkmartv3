import {
  checkWishlisted,
  addToWishlist as addWishlistItem,
  removeFromWishlist as removeWishlistItem,
} from '@/services/wishlistService';

export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  productImage: string;
  productPrice: number;
  productCoinPrice?: number;
  addedAt: Date;
}

export interface Product {
  id: string;
  name: string;
  image: string;
  images?: string[];
  price: number;
  coinPrice?: number;
  inStock: boolean;
}

export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
  const result = await checkWishlisted(userId, productId);
  return result.isWishlisted;
}

export async function toggleWishlist(
  userId: string,
  product: Product
): Promise<{ added: boolean }> {
  const current = await checkWishlisted(userId, product.id);

  if (current.isWishlisted && current.wishlistId) {
    await removeWishlistItem(userId, current.wishlistId);
    return { added: false };
  }

  await addWishlistItem(userId, product.id);
  return { added: true };
}
