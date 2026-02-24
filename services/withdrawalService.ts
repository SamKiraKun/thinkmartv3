// File: services/withdrawalService.ts
/**
 * Withdrawal Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';

export interface ApiWithdrawal {
    id: string;
    userId: string;
    amount: number;
    method: string;
    status: string;
    bankDetails: any;
    upiId: string | null;
    rejectionReason: string | null;
    requestedAt: string;
    processedAt: string | null;
}

export interface WithdrawalSummary {
    totalRequests: number;
    totalWithdrawn: number;
    pendingAmount: number;
    pendingCount: number;
    rejectedCount: number;
}

export async function fetchWithdrawals(
    _userId: string,
    page = 1,
    pageLimit = 10,
    status?: string
): Promise<PaginatedResponse<ApiWithdrawal>> {
    const params = new URLSearchParams({ page: String(page), limit: String(pageLimit) });
    if (status) params.set('status', status);
    return apiClient.get<PaginatedResponse<ApiWithdrawal>>(`/api/withdrawals?${params.toString()}`);
}

export async function fetchWithdrawalSummary(_userId: string): Promise<WithdrawalSummary> {
    const res = await apiClient.get<{ data: WithdrawalSummary }>('/api/withdrawals/summary');
    return res.data;
}

export interface CreateWithdrawalInput {
    amount: number;
    method: string;
    bankDetails?: Record<string, string>;
    upiId?: string;
}

export async function createWithdrawal(input: CreateWithdrawalInput): Promise<{ id: string }> {
    const res = await apiClient.post<{ data: { id: string } }>('/api/withdrawals', input);
    return res.data;
}

