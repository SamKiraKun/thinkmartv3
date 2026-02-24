// File: functions/src/triggers/transactions.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { distributeTeamIncome } from '../mlm/distributeIncome';

const db = admin.firestore();

/**
 * PRODUCTION-READY Trigger: Transaction Listener
 * 
 * Logic:
 * 1. Listens for 'TASK_REWARD' -> Triggers MLM distribution.
 * 
 * NOTE: Partner commission was REMOVED from this trigger.
 * Partner commission is now handled DIRECTLY in the calling functions
 * (requestWithdrawalSecure, processWithdrawalSecure, createOrderMultiItem)
 * via the distributePartnerCommission helper in partner.ts.
 * This prevents double-payout issues that occurred when both the direct
 * call AND this trigger would fire on the same transaction.
 */
export const onTransactionCreate = functions.firestore
    .document('transactions/{txnId}')
    .onCreate(async (snap, context) => {
        const txn = snap.data();
        const txnId = context.params.txnId;

        // MLM Distribution Trigger - ONLY for task rewards
        // Note: We pass txnId to ensure idempotency in the distribution logic
        if (txn.type === 'TASK_REWARD' && txn.currency === 'COIN') {
            await distributeTeamIncome(txn.userId, txn.amount, txnId);
        }

        // Partner commission is NO LONGER triggered here.
        // See note above for explanation.
    });