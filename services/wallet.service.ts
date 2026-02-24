// File: ThinkMart/services/wallet.service.ts
/**
 * Legacy wallet service wrapper (API/Turso-backed)
 */

import { Wallet, Transaction } from '@/types/wallet';
import { fetchRecentTransactions } from '@/services/walletService';
import { apiClient } from '@/lib/api/client';

function toWallet(api: any): Wallet {
  return {
    userId: api.userId,
    coinBalance: Number(api.coinBalance || 0),
    cashBalance: Number(api.cashBalance || 0),
    totalEarnings: Number(api.totalEarnings || 0),
    totalWithdrawals: Number(api.totalWithdrawals || 0),
    updatedAt: new Date(api.updatedAt || Date.now()) as any,
  } as Wallet;
}

function toTx(api: any): Transaction {
  return {
    id: api.id,
    userId: api.userId,
    type: api.type,
    amount: Number(api.amount || 0),
    currency: api.currency,
    status: api.status,
    description: api.description || '',
    relatedUserId: api.relatedUserId || undefined,
    taskId: api.taskId || undefined,
    taskType: api.taskType || undefined,
    level: api.level ?? undefined,
    sourceTxnId: api.sourceTxnId || undefined,
    createdAt: new Date(api.createdAt || Date.now()) as any,
  } as Transaction;
}

export const walletService = {
  async getWallet(_userId: string): Promise<Wallet | null> {
    try {
      const res = await apiClient.get<{ data: any }>('/api/wallet');
      return toWallet(res.data);
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 401) return null;
      throw error;
    }
  },

  async getTransactions(_userId: string, limitCount: number = 50): Promise<Transaction[]> {
    const rows = await fetchRecentTransactions('self', limitCount);
    return rows.map((r) => toTx({ ...r, createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt }));
  },

  async getTransactionsByType(_userId: string, type: string, limitCount: number = 20): Promise<Transaction[]> {
    const res = await apiClient.get<{ data: any[] } & { pagination?: any }>(
      `/api/wallet/transactions?page=1&limit=${limitCount}&type=${encodeURIComponent(type)}`
    );
    return (res.data || []).map(toTx);
  },
};

