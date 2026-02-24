import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { ApiProduct } from '@/lib/api/types';

const PUBLIC_R2_BASE =
    (process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '');

export interface VendorDashboardStats {
    totalProducts: number;
    activeProducts: number;
    totalOrders: number;
    pendingOrders: number;
    totalRevenue: number;
}

export interface VendorOrder {
    id: string;
    userId: string;
    userName?: string;
    items: Array<{ productId: string; productName: string; quantity: number; price: number }>;
    vendorItemCount: number;
    totalItemCount: number;
    status: string;
    createdAt: string | null;
    shippingAddress?: string;
}

export interface VendorAnalytics {
    revenueTrend: Array<{ date: string; revenue: number; orderCount: number }>;
    topProducts: Array<{ productId: string; name: string; totalSold: number; totalRevenue: number; imageUrl: string | null }>;
    fulfillment: {
        averageProcessingHours: number;
        onTimeRate: number;
        pendingCount: number;
        confirmedCount: number;
        shippedCount: number;
        deliveredCount: number;
        cancelledCount: number;
    };
    summary: {
        totalRevenueLast30Days: number;
        totalOrdersLast30Days: number;
        averageOrderValue: number;
        returnRate: number;
    };
}

export interface VendorStoreProfile {
    vendorId: string;
    businessName: string;
    contactEmail: string;
    contactPhone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pincode: string;
    payoutMethod: string;
    payoutAccount: string;
    logoUrl: string;
    bannerUrl: string;
}

export async function fetchVendorDashboardStats(): Promise<VendorDashboardStats> {
    const res = await apiClient.get<{ data: VendorDashboardStats }>('/api/vendor/dashboard');
    return res.data;
}

export async function fetchVendorOrders(page = 1, limit = 25, status?: string): Promise<PaginatedResponse<VendorOrder>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status && status !== 'all') params.set('status', status);
    return apiClient.get<PaginatedResponse<VendorOrder>>(`/api/vendor/orders?${params.toString()}`);
}

export async function fetchVendorAnalytics(): Promise<VendorAnalytics> {
    const res = await apiClient.get<{ data: VendorAnalytics }>('/api/vendor/analytics');
    return res.data;
}

export async function fetchVendorStoreProfile(): Promise<VendorStoreProfile> {
    const res = await apiClient.get<{ data: VendorStoreProfile }>('/api/vendor/store-profile');
    return res.data;
}

export async function updateVendorStoreProfile(input: Partial<VendorStoreProfile>): Promise<void> {
    await apiClient.patch('/api/vendor/store-profile', input);
}

export async function fetchMyProducts(page = 1, limit = 100, status?: string): Promise<PaginatedResponse<ApiProduct>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    return apiClient.get<PaginatedResponse<ApiProduct>>(`/api/products/mine?${params.toString()}`);
}

export async function uploadVendorProductImage(file: File, uid: string): Promise<string> {
    const contentType = file.type || 'application/octet-stream';
    const presign = await apiClient.post<any>('/api/storage/presign', {
        filename: file.name,
        contentType,
        folder: `products/${uid}`,
    });
    const payload = presign.data?.data || presign.data || presign;
    const uploadUrl = payload.uploadUrl;
    const key = payload.key;
    if (!uploadUrl || !key) throw new Error('Invalid upload response');

    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    if (!res.ok) throw new Error('Image upload failed');
    return PUBLIC_R2_BASE ? `${PUBLIC_R2_BASE}/${key}` : `https://pub-mock-thinkmart.r2.dev/${key}`;
}
