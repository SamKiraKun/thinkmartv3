// File: ThinkMart/hooks/useWallet.ts
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { subscribeToWallet, fetchRecentTransactions, fetchLifetimeWithdrawn } from '@/services/walletService';
import { Wallet, Transaction } from '@/types/wallet';

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lifetimeWithdrawn, setLifetimeWithdrawn] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // 1. Wallet Balance Listener (hybrid: Firestore onSnapshot OR API fetch)
  useEffect(() => {
    if (!user) {
      setWallet(null);
      setTransactions([]);
      setLifetimeWithdrawn(0);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToWallet(
      user.uid,
      (walletData) => {
        setWallet(walletData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching wallet:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, refreshTick]);

  // 2. Fetch Recent Transactions (hybrid: Firestore query OR API call)
  useEffect(() => {
    if (!user) return;

    fetchRecentTransactions(user.uid, 5)
      .then(setTransactions)
      .catch((error) => console.error('Error fetching transactions:', error));
  }, [user, refreshTick]);

  // 3. Fetch Lifetime Withdrawn (hybrid: Firestore sum OR API pre-computed)
  useEffect(() => {
    if (!user) return;

    fetchLifetimeWithdrawn(user.uid)
      .then(setLifetimeWithdrawn)
      .catch((error) => console.error('Error fetching lifetime withdrawn:', error));
  }, [user, refreshTick]);

  // Helper to convert coins to estimated cash (1000 Coins = ₹1)
  const estimatedCashValue = wallet ? (wallet.coinBalance / 1000) : 0;

  return {
    wallet,
    transactions,
    loading,
    estimatedCashValue,
    lifetimeWithdrawn,
    refresh: () => setRefreshTick((v) => v + 1),
  };
}
