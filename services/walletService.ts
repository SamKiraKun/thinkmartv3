// File: services/walletService.ts
/**
 * Wallet Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { Wallet, Transaction } from '@/types/wallet';
import type { ApiWallet, ApiTransaction } from '@/lib/api/types';

export function subscribeToWallet(
    _uid: string,
    onData: (wallet: Wallet | null) => void,
    onError?: (error: Error) => void
): () => void {
    let cancelled = false;

    const fetchWallet = async () => {
        try {
            const res = await apiClient.get<{ data: ApiWallet }>('/api/wallet');
            if (!cancelled) onData(apiWalletToWallet(res.data));
        } catch (err) {
            if (!cancelled) onError?.(err instanceof Error ? err : new Error(String(err)));
        }
    };

    void fetchWallet();
    return () => {
        cancelled = true;
    };
}

export async function fetchRecentTransactions(
    _uid: string,
    count = 5
): Promise<Transaction[]> {
    const res = await apiClient.get<PaginatedResponse<ApiTransaction>>(
        `/api/wallet/transactions?page=1&limit=${count}`
    );
    return res.data.map(apiTxnToTransaction);
}

export async function fetchLifetimeWithdrawn(_uid: string): Promise<number> {
    const res = await apiClient.get<{ data: ApiWallet }>('/api/wallet');
    return Number(res.data.totalWithdrawals || 0);
}

function apiWalletToWallet(api: ApiWallet): Wallet {
    return {
        userId: api.userId,
        coinBalance: api.coinBalance,
        cashBalance: api.cashBalance,
        totalEarnings: api.totalEarnings,
        totalWithdrawals: api.totalWithdrawals,
        updatedAt: api.updatedAt ? (new Date(api.updatedAt) as any) : undefined,
    } as Wallet;
}

function apiTxnToTransaction(api: ApiTransaction): Transaction {
    return {
        id: api.id,
        userId: api.userId,
        type: api.type,
        amount: api.amount,
        currency: api.currency,
        status: api.status,
        description: api.description,
        relatedUserId: api.relatedUserId,
        taskId: api.taskId,
        taskType: api.taskType,
        level: api.level,
        sourceTxnId: api.sourceTxnId,
        createdAt: new Date(api.createdAt) as any,
    } as Transaction;
}

export async function creditWalletAdmin(
    userId: string,
    amount: number,
    currency: 'COIN' | 'CASH',
    description: string
): Promise<{ id: string; status: string }> {
    const res = await apiClient.post<{ data: { id: string; status: string } }>('/api/wallet/credit', {
        userId,
        amount,
        currency,
        description,
    });
    return res.data;
}

export async function convertCoinsToCash(
    coins: number
): Promise<{ convertedAmount: number; coinsConverted: number; currency: 'CASH' }> {
    const res = await apiClient.post<{ data: { convertedAmount: number; coinsConverted: number; currency: 'CASH' } }>(
        '/api/wallet/convert-coins',
        { coins }
    );
    return res.data;
}

