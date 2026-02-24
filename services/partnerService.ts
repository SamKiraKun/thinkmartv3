import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { ApiProduct } from '@/lib/api/types';

export interface PartnerDashboardData {
    partnerId: string;
    partnerName: string;
    assignedCity: string | null;
    commissionPercentage: number;
    totalStats: {
        totalUsers: number;
        activeUsers7d: number;
        totalWithdrawals: number;
        totalCommissionEarned: number;
        walletBalance: number;
        totalEarnings: number;
    };
}

export interface PartnerCityUser {
    id: string;
    name: string;
    phone: string;
    email: string;
    city: string;
    kycStatus: string;
    membershipActive: boolean;
    createdAt: string;
    lastActiveAt?: string;
}

export interface PartnerAnalyticsData {
    earningsChart: { date: string; earnings: number; transactions: number }[];
    userGrowthChart: { date: string; newUsers: number }[];
    topDays: { date: string; earnings: number }[];
    summary: {
        totalEarnings: number;
        totalTransactions: number;
        newUsers: number;
        avgDailyEarnings: number;
    };
}

export interface PartnerCommissionLog {
    id: string;
    city: string;
    sourceType: 'withdrawal' | 'purchase' | string;
    sourceAmount: number;
    commissionPercentage: number;
    commissionAmount: number;
    status: string;
    createdAt: string;
    sourceUserId?: string;
    sourceUserName?: string | null;
}

export async function fetchPartnerDashboardStats(): Promise<PartnerDashboardData> {
    const res = await apiClient.get<{ data: PartnerDashboardData }>('/api/partner/dashboard');
    return res.data;
}

export async function fetchPartnerUsers(
    page = 1,
    limit = 20,
    filters?: { kycStatus?: string; search?: string }
): Promise<PaginatedResponse<PartnerCityUser>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.kycStatus) params.set('kycStatus', filters.kycStatus);
    if (filters?.search) params.set('search', filters.search);
    return apiClient.get<PaginatedResponse<PartnerCityUser>>(`/api/partner/users?${params.toString()}`);
}

export async function fetchPartnerAnalytics(days = 30): Promise<PartnerAnalyticsData> {
    const res = await apiClient.get<{ data: PartnerAnalyticsData }>(`/api/partner/analytics?days=${days}`);
    return res.data;
}

export async function fetchPartnerCommissionHistory(page = 1, limit = 30): Promise<PaginatedResponse<PartnerCommissionLog>> {
    return apiClient.get<PaginatedResponse<PartnerCommissionLog>>(`/api/partner/commissions?page=${page}&limit=${limit}`);
}

export async function fetchPartnerProducts(page = 1, limit = 100): Promise<PaginatedResponse<ApiProduct>> {
    return apiClient.get<PaginatedResponse<ApiProduct>>(`/api/products/mine?page=${page}&limit=${limit}`);
}
