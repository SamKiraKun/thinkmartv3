import { apiClient, type PaginatedResponse } from '@/lib/api/client';

export interface OrganizationDashboardResponse {
    org: {
        id: string;
        referralCode: string;
        status: string;
        orgName: string;
        orgType: string;
        commissionPercentage: number;
    };
    stats: {
        memberCount: number;
        totalEarnings: number;
        pendingEarnings: number;
        thisMonthEarnings: number;
    };
    recentMembers: Array<{
        id: string;
        name: string;
        email: string;
        joinedAt: string;
        membershipActive: boolean;
    }>;
}

export interface OrganizationMember {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    city?: string | null;
    membershipActive: boolean;
    createdAt: string;
}

export interface OrganizationEarningsResponse {
    logs: Array<{
        id: string;
        amount: number;
        sourceType: string;
        sourceUserId: string;
        sourceUserName?: string | null;
        createdAt: string;
    }>;
    stats: {
        totalEarnings: number;
        thisMonth: number;
        pendingPayout: number;
    };
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export async function fetchOrganizationDashboard(): Promise<OrganizationDashboardResponse> {
    const res = await apiClient.get<{ data: OrganizationDashboardResponse }>('/api/organizations/me/dashboard');
    return res.data;
}

export async function fetchOrganizationMembers(
    page = 1,
    limit = 100,
    search?: string
): Promise<PaginatedResponse<OrganizationMember>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    return apiClient.get<PaginatedResponse<OrganizationMember>>(`/api/organizations/me/members?${params.toString()}`);
}

export async function fetchOrganizationEarnings(page = 1, limit = 50): Promise<OrganizationEarningsResponse> {
    const res = await apiClient.get<{ data: OrganizationEarningsResponse }>(
        `/api/organizations/me/earnings?page=${page}&limit=${limit}`
    );
    return res.data;
}
