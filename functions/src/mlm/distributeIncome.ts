// File: functions/src/mlm/distributeIncome.ts
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

/**
 * PRODUCTION-READY: Distribute Team Income
 * * Features:
 * 1. Idempotency: Checks for existing payout records to prevent duplicate commissions.
 * 2. Membership Validation: Strictly enforces 'membershipActive' check.
 * 3. Atomic Batching: Writes all commission updates in a single batch.
 * * @param earnerId - ID of the user who earned
 * @param amount - Amount earned
 * @param sourceTxnId - ID of the original transaction (used for idempotency)
 */
export async function distributeTeamIncome(
    earnerId: string, 
    amount: number, 
    sourceTxnId: string
) {
  try {
    const userDoc = await db.collection('users').doc(earnerId).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data();
    const uplineIds: string[] = userData?.uplinePath || [];

    if (uplineIds.length === 0) return;

    // Percentages: Level 1-2: 5%, Level 3-4: 3%, Level 5-6: 2%
    const percentages = [0.05, 0.05, 0.03, 0.03, 0.02, 0.02];
    const batch = db.batch();
    let writeCount = 0;

    // Fetch all uplines
    const uplineDocs = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', uplineIds)
        .get();
    
    const uplineMap = new Map();
    uplineDocs.forEach(doc => uplineMap.set(doc.id, doc.data()));

    for (let i = 0; i < uplineIds.length && i < 6; i++) {
        const uplineId = uplineIds[i];
        const uplineData = uplineMap.get(uplineId);
        
        if (!uplineData) continue;

        // 1. Check Membership
        if (!uplineData.membershipActive) continue;

        // 2. Calculate Commission
        const commission = Math.floor(amount * percentages[i]);
        if (commission <= 0) continue;

        // 3. Idempotency Key
        // We construct a unique ID for this commission payout: "sourceTxnId_uplineId"
        const commissionTxnId = `comm_${sourceTxnId}_${uplineId}`;
        const commissionTxnRef = db.collection('transactions').doc(commissionTxnId);
        
        // We must check if this exists. 
        // Note: In a pure Batch, we can't "read" conditionally, so we use `create`.
        // `batch.create` fails if doc exists. This acts as our safety lock.
        // However, if one fails, the whole batch fails. 
        // Better approach for MLM (since we want all or nothing):
        // We assume if the batch runs, it runs once. If it retries, `batch.create` will throw "ALREADY_EXISTS"
        // and safely stop the duplication.
        
        batch.create(commissionTxnRef, {
            userId: uplineId,
            type: 'TEAM_INCOME',
            amount: commission,
            currency: 'COIN',
            description: `Level ${i+1} income from ${userData?.name || 'Downline'}`,
            status: 'COMPLETED',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            relatedUserId: earnerId,
            sourceTxnId: sourceTxnId, // Traceability
            level: i + 1
        });

        const uplineWalletRef = db.collection('wallets').doc(uplineId);
        batch.update(uplineWalletRef, {
            coinBalance: admin.firestore.FieldValue.increment(commission),
            totalEarnings: admin.firestore.FieldValue.increment(commission)
        });

        writeCount++;
    }

    if (writeCount > 0) {
        await batch.commit();
        functions.logger.info(`Distributed team income for ${earnerId} (Txn: ${sourceTxnId})`);
    }

  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 6
    ) { // 'ALREADY_EXISTS' gRPC error code
        functions.logger.info(`MLM Payout for ${sourceTxnId} already processed. Skipping.`);
    } else {
        functions.logger.error("Error distributing team income:", error);
    }
  }
}
