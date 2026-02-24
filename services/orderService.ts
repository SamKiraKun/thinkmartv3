// File: services/orderService.ts
/**
 * Order Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';

export interface ApiOrder {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    items: any[];
    subtotal: number;
    cashPaid: number;
    coinsRedeemed: number;
    coinValue: number;
    couponCode: string | null;
    couponDiscount: number;
    shippingAddress: any;
    status: string;
    statusHistory: any[];
    trackingNumber: string | null;
    city: string;
    adminNotes: string | null;
    createdAt: string;
    updatedAt: string;
}

export async function fetchOrders(
    _userId: string,
    page = 1,
    pageLimit = 10,
    status?: string
): Promise<PaginatedResponse<ApiOrder>> {
    const params = new URLSearchParams({ page: String(page), limit: String(pageLimit) });
    if (status) params.set('status', status);
    return apiClient.get<PaginatedResponse<ApiOrder>>(`/api/orders?${params.toString()}`);
}

export async function fetchOrder(id: string): Promise<ApiOrder | null> {
    try {
        const res = await apiClient.get<{ data: ApiOrder }>(`/api/orders/${id}`);
        return res.data;
    } catch (error: any) {
        if (error?.statusCode === 404) return null;
        throw error;
    }
}

export interface CreateOrderInput {
    items: Array<{
        productId: string;
        quantity: number;
        price: number;
        coinPrice?: number;
        isCoinOnly?: boolean;
        isCashOnly?: boolean;
        productName?: string;
        productImage?: string;
        unitPrice?: number;
        [key: string]: unknown;
    }>;
    shippingAddress: Record<string, any>;
    subtotal: number;
    cashPaid: number;
    coinsRedeemed: number;
    coinValue: number;
    couponCode?: string;
    couponDiscount?: number;
}

export async function createOrder(input: CreateOrderInput): Promise<{ id: string; status: string }> {
    const res = await apiClient.post<{ data: { id: string; status: string } }>('/api/orders', input);
    return res.data;
}

export async function updateOrderStatus(
    id: string,
    status: string,
    note?: string,
    trackingNumber?: string
): Promise<void> {
    await apiClient.patch(`/api/orders/${id}/status`, { status, note, trackingNumber });
}

export async function cancelOrder(id: string, reason?: string): Promise<{ id: string; status: string }> {
    const res = await apiClient.post<{ data: { id: string; status: string } }>(
        `/api/orders/${id}/cancel`,
        { reason }
    );
    return res.data;
}

