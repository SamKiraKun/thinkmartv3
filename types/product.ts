// File: ThinkMart/types/product.ts
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string; // URL (legacy, use images[] for new products)
  images?: string[]; // Array of image URLs (1-5 images)
  commission: number; // Cash commission for referrals
  coinPrice?: number; // Optional price in coins
  inStock: boolean;
  stock?: number;            // Available quantity (display only)
  badges?: string[];         // 'popular', 'new', 'bestseller', 'coin-only', 'cash-only'
  coinOnly?: boolean;        // Only purchasable with coins
  cashOnly?: boolean;        // Only purchasable with cash
  deliveryDays?: number;     // Estimated delivery days
  vendor?: string;           // Vendor ID or name
  createdAt: any; // Firestore Timestamp
  updatedAt: any;
}