// File: ThinkMart/types/wallet.ts
import { Timestamp } from 'firebase/firestore';

/**
 * Wallet Document Structure
 * Collection: 'wallets'
 * ID: userId
 */
export interface Wallet {
  userId: string;
  
  // Balances
  coinBalance: number;       // Replaces 'coins'
  cashBalance: number;       // Replaces 'balance' (Real money in INR)
  
  // Stats
  totalEarnings: number;     // Replaces 'totalEarned'
  totalWithdrawals: number;  // Matches existing
  
  // Metadata
  updatedAt: Timestamp;      // Replaces 'lastUpdated'
}

/**
 * Transaction Types
 * Used for filtering in the dashboard (e.g., "Show only Referral Income")
 */
export type TransactionType = 
  | 'TASK_REWARD'
  | 'REFERRAL_BONUS'
  | 'TEAM_INCOME'
  | 'WITHDRAWAL'
  | 'PURCHASE'
  | 'MEMBERSHIP_FEE'
  | 'PARTNER_COMMISSION';

export type CurrencyType = 'COIN' | 'INR' | 'CASH';

/**
 * Transaction Document Structure
 * Collection: 'transactions'
 */
export interface Transaction {
  id?: string;               // Firestore Document ID
  userId: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyType;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  description: string;
  createdAt: Timestamp;      // Replaces 'timestamp'
  
  // Context Fields (Optional based on type)
  relatedUserId?: string;    // ID of the user who caused this earning (for MLM/Referrals)
  taskId?: string;           // ID of the task completed
  taskType?: string;         // 'SURVEY', 'SPIN', etc.
  level?: number;            // MLM Level (1-6)
  sourceTxnId?: string;      // ID of the original transaction (for tracing MLM payouts)
}