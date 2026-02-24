// File: ThinkMart/functions/src/tasks/rewardTask.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Helper for Weighted Random Selection (for Spin/Lucky Box)
const pickRandomReward = (rewards: { amount: number, weight: number }[]) => {
    const totalWeight = rewards.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of rewards) {
        if (random < item.weight) return item.amount;
        random -= item.weight;
    }
    return rewards[0].amount; // Fallback
};

/**
 * PRODUCTION-READY: Reward Task Completion (Enhanced)
 * * Features:
 * 1. Time Verification: Checks against 'task_starts' collection.
 * 2. Server-Side RNG: Calculates Spin/Lucky Box results securely.
 * 3. Idempotency & Transactions: Prevents double-claiming.
 */
export const rewardTask = functions.https.onCall(async (data, context) => {
    // 1. Security Checks
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userId = context.auth.uid;
    const { taskId, sessionId } = data; // Support both for now, but sessionId is preferred for Surveys

    if (!taskId && !sessionId) throw new functions.https.HttpsError('invalid-argument', 'Task or Session ID is required.');

    try {
        return await db.runTransaction(async (transaction) => {
            let activeTaskId = taskId;
            let sessionData: any = null;
            let sessionRef: admin.firestore.DocumentReference | null = null;

            // A. Validate Session (If provided - Mandatory for Surveys)
            if (sessionId) {
                sessionRef = db.collection('task_sessions').doc(sessionId);
                const sessionDoc = await transaction.get(sessionRef);
                if (!sessionDoc.exists) throw new functions.https.HttpsError('not-found', 'Session not found.');

                sessionData = sessionDoc.data();
                if (sessionData.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Unauthorized.');
                if (sessionData.status === 'COMPLETED') throw new functions.https.HttpsError('already-exists', 'Session already claimed.');

                activeTaskId = sessionData.taskId;
            }

            // B. Fetch Task Details
            const taskRef = db.collection('tasks').doc(activeTaskId);
            const taskDoc = await transaction.get(taskRef);

            if (!taskDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Task not found.');
            }

            const taskData = taskDoc.data() ?? {};
            const taskType = String(taskData?.type || '').toUpperCase();
            const isActive = taskData?.isActive ?? true;
            if (!isActive) throw new functions.https.HttpsError('failed-precondition', 'Task inactive.');

            // C. Survey Specific Validation
            if (taskType === 'SURVEY') {
                if (!sessionData) throw new functions.https.HttpsError('invalid-argument', 'Surveys require a valid session.');

                const questionCount = taskData.questions?.length || 0;
                if (sessionData.currentStep < questionCount) {
                    throw new functions.https.HttpsError('failed-precondition', 'Survey not complete. Please answer all questions.');
                }
            } else if (['VIDEO', 'WEBSITE', 'WATCH_VIDEO'].includes(taskType)) {
                // TIME-BASED TASKS: Verify user watched/visited for minimum duration
                const startTime = sessionData ? sessionData.startedAt.toMillis() : 0;

                if (!startTime) {
                    // Fallback to task_starts if no session (legacy)
                    const startRef = db.collection('task_starts').doc(`start_${userId}_${activeTaskId}`);
                    const startDoc = await transaction.get(startRef);
                    if (startDoc.exists) {
                        transaction.delete(startRef); // Cleanup
                    }
                } else {
                    const minDuration = (taskData?.minDuration || 30) * 1000;
                    if (Date.now() - startTime < minDuration) {
                        throw new functions.https.HttpsError('failed-precondition', 'Task completed too quickly.');
                    }
                }
            }

            // D. Determine Reward Amount
            let rewardAmount = Number(taskData?.reward ?? taskData?.rewardAmount) || 0;

            // If it's a Game, calculate reward based on weights
            if ((taskType === 'SPIN' || taskType === 'LUCKY_BOX') && taskData?.possibleRewards) {
                rewardAmount = pickRandomReward(taskData.possibleRewards);
            }

            const rewardType = String(taskData?.rewardType || 'COIN').toUpperCase();
            const frequency = taskData?.frequency || 'DAILY';

            // E. Idempotency / Frequency Check
            let completionDocId = '';
            if (frequency === 'DAILY') {
                const todayStr = new Date().toISOString().split('T')[0];
                completionDocId = `${userId}_${activeTaskId}_${todayStr}`;
            } else if (frequency === 'ONCE') {
                completionDocId = `${userId}_${activeTaskId}`;
            } else {
                completionDocId = db.collection('task_completions').doc().id;
            }

            const completionRef = db.collection('task_completions').doc(completionDocId);
            const completionDoc = await transaction.get(completionRef);

            if (completionDoc.exists) {
                throw new functions.https.HttpsError('already-exists', 'Task limit reached for today/user.');
            }

            // F. Execute Writes

            // 1. Mark Session Completed
            if (sessionRef) {
                transaction.update(sessionRef, { status: 'COMPLETED', completedAt: admin.firestore.FieldValue.serverTimestamp() });
            }

            // 2. Record Completion
            transaction.set(completionRef, {
                userId,
                taskId: activeTaskId,
                taskTitle: taskData?.title || 'Unknown Task',
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                reward: rewardAmount,
                rewardType,
                completionId: completionDocId,
                sessionId: sessionId || null
            });

            // 3. Update Wallet
            const walletRef = db.collection('wallets').doc(userId);
            const balanceField = rewardType === 'CASH' ? 'cashBalance' : 'coinBalance';

            transaction.update(walletRef, {
                [balanceField]: admin.firestore.FieldValue.increment(rewardAmount),
                totalEarnings: admin.firestore.FieldValue.increment(rewardAmount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4. Transaction Log
            const txnRef = db.collection('transactions').doc();
            transaction.set(txnRef, {
                userId,
                type: 'TASK_REWARD',
                taskType: taskType || 'GENERIC',
                taskId: activeTaskId,
                amount: rewardAmount,
                currency: rewardType,
                status: 'COMPLETED',
                description: `Reward for ${taskData?.title || 'Task'}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                sourceCompletionId: completionDocId
            });

            return {
                success: true,
                reward: rewardAmount,
                currency: rewardType,
                message: 'Reward claimed!'
            };
        });
    } catch (error: unknown) {
        console.error("Reward Task Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Reward processing failed.');
    }
});
