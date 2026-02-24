// File: ThinkMart/types/order.ts
import { Timestamp } from 'firebase/firestore';

// Order Item for multi-product orders
export interface OrderItem {
  productId: string;
  productName: string;
  productImage?: string;
  quantity: number;
  unitPrice: number;      // Cash price per unit
  coinPrice?: number;     // Coin price per unit
}

// Shipping Address
export interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

// Status History Entry
export interface OrderStatusEntry {
  status: string;
  at: any; // Firestore Timestamp
  by?: string; // Admin UID if changed by admin
  note?: string;
}

// Full Order Interface
export interface Order {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;

  // Items (supports multi-product)
  items: OrderItem[];

  // Pricing
  subtotal: number;       // Total cash value
  cashPaid: number;       // Cash deducted
  coinsRedeemed: number;  // Coins deducted
  coinValue: number;      // Cash equivalent of coins used

  // Shipping
  shippingAddress?: ShippingAddress;

  // Status
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  statusHistory: OrderStatusEntry[];

  // Metadata
  city?: string;          // User's city at order time
  refundReason?: string;
  refundedAt?: any;

  // Timestamps
  createdAt: any;
  updatedAt?: any;
}