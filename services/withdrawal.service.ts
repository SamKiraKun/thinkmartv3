// File: ThinkMart/services/withdrawal.service.ts
/**
 * Legacy withdrawal service wrapper (API/Turso-backed)
 */

import { Withdrawal } from '@/types/withdrawal';
import { fetchWithdrawals } from '@/services/withdrawalService';
import { apiClient } from '@/lib/api/client';

function toWithdrawal(api: any): Withdrawal {
  return {
    id: api.id,
    userId: api.userId,
    amount: Number(api.amount || 0),
    method: api.method,
    status: api.status,
    requestedAt: new Date(api.requestedAt || Date.now()),
    processedAt: api.processedAt ? new Date(api.processedAt) : undefined,
    bankDetails: api.bankDetails || undefined,
    rejectionReason: api.rejectionReason || undefined,
  } as Withdrawal;
}

export const withdrawalService = {
  async getWithdrawal(withdrawalId: string): Promise<Withdrawal | null> {
    const res = await fetchWithdrawals('self', 1, 100);
    const match = res.data.find((w) => w.id === withdrawalId);
    return match ? toWithdrawal(match) : null;
  },

  async getUserWithdrawals(_userId: string, limitCount = 50): Promise<Withdrawal[]> {
    const res = await fetchWithdrawals('self', 1, limitCount);
    return res.data.map(toWithdrawal);
  },

  async getPendingWithdrawals(limitCount = 30): Promise<Withdrawal[]> {
    try {
      const res = await apiClient.get<{ data: any[]; pagination: any }>(
        `/api/withdrawals?page=1&limit=${limitCount}&status=pending`
      );
      return (res.data || []).map(toWithdrawal);
    } catch (error: any) {
      if (error?.statusCode === 403) {
        // No admin endpoint parity here; return empty for legacy unused wrapper path.
        return [];
      }
      throw error;
    }
  },
};

