// File: services/referralService.ts
/**
 * Referral / Team Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';

export interface TeamMember {
    uid: string;
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
    state: string | null;
    membershipActive: boolean;
    createdAt: string;
}

export interface ReferralStats {
    ownReferralCode: string;
    directReferrals: number;
    activeMembers: number;
    totalTeam: number;
    totalEarnings: number;
    totalTransactions: number;
}

export interface ReferralEarning {
    id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    relatedUserId: string | null;
    relatedUserName: string | null;
    level: number | null;
    createdAt: string;
}

export interface DownlineChildNode {
    uid: string;
    name: string;
    referralCode: string;
    ownReferralCode: string;
}

export async function fetchTeam(
    _userId: string,
    page = 1,
    pageLimit = 20,
    level?: number
): Promise<PaginatedResponse<TeamMember>> {
    const params = new URLSearchParams({ page: String(page), limit: String(pageLimit) });
    if (level) params.set('level', String(level));
    return apiClient.get<PaginatedResponse<TeamMember>>(`/api/referrals/team?${params.toString()}`);
}

export async function fetchReferralStats(_userId: string): Promise<ReferralStats> {
    const res = await apiClient.get<{ data: ReferralStats }>('/api/referrals/stats');
    return res.data;
}

export async function fetchReferralEarnings(
    _userId: string,
    page = 1,
    pageLimit = 20
): Promise<PaginatedResponse<ReferralEarning>> {
    return apiClient.get<PaginatedResponse<ReferralEarning>>(
        `/api/referrals/earnings?page=${page}&limit=${pageLimit}`
    );
}

export async function fetchDownlineChildren(parentReferralCode: string): Promise<DownlineChildNode[]> {
    const params = new URLSearchParams({ parentReferralCode });
    const res = await apiClient.get<{ data: DownlineChildNode[] }>(`/api/referrals/downline-children?${params.toString()}`);
    return res.data || [];
}
