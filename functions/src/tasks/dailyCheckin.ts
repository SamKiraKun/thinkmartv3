// File: functions/src/tasks/dailyCheckin.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { withValidation } from '../lib/validation';

const db = admin.firestore();
const DailyCheckinSchema = z.object({}).passthrough().optional().default({});
const TASK_CHECKIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function toMillis(value: unknown): number {
    if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    if (value && typeof (value as { seconds?: unknown }).seconds === "number") {
        return Number((value as { seconds: number }).seconds) * 1000;
    }
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return 0;
}

function buildCooldown(nextAvailableAt: unknown, nowMs: number) {
    const nextMs = toMillis(nextAvailableAt);
    if (!nextMs) {
        return {
            nextAvailableAt: null,
            secondsRemaining: 0,
        };
    }

    return {
        nextAvailableAt: new Date(nextMs).toISOString(),
        secondsRemaining: nextMs > nowMs ? Math.ceil((nextMs - nowMs) / 1000) : 0,
    };
}

/**
 * Daily Check-in Cloud Function
 * 
 * Features:
 * 1. One check-in per day
 * 2. Streak tracking with bonus multiplier
 * 3. Streak resets if user misses a day
 */
export const dailyCheckin = functions.https.onCall(withValidation(DailyCheckinSchema, async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userId = context.auth.uid;
    const BASE_REWARD = 100; // Base coins per check-in
    const STREAK_BONUS = 20; // Bonus per streak day

    try {
        return await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const walletRef = db.collection('wallets').doc(userId);
            const cooldownRef = db.collection('cooldowns').doc(userId);

            // Read Phase
            const [userDoc, walletDoc, cooldownDoc] = await Promise.all([
                transaction.get(userRef),
                transaction.get(walletRef),
                transaction.get(cooldownRef)
            ]);

            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User not found.');
            }

            const userData = userDoc.data()!;
            const nowTs = admin.firestore.Timestamp.now();
            const nowMs = nowTs.toMillis();
            const now = new Date(nowMs);
            const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

            const cooldownData = cooldownDoc.exists ? cooldownDoc.data() : {};
            const existingNextAt = cooldownData?.tasks?.nextAvailableAt;
            if (toMillis(existingNextAt) > nowMs) {
                throw new functions.https.HttpsError(
                    'resource-exhausted',
                    'Task claim is on cooldown.',
                    buildCooldown(existingNextAt, nowMs)
                );
            }

            // Check last check-in
            const lastCheckin = userData.lastCheckinDate || null;
            const currentStreak = userData.checkinStreak || 0;

            // Already checked in today?
            if (lastCheckin === todayStr) {
                const tomorrowStart = new Date(now);
                tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
                tomorrowStart.setUTCHours(0, 0, 0, 0);
                throw new functions.https.HttpsError(
                    'resource-exhausted',
                    'Already checked in for today.',
                    buildCooldown(admin.firestore.Timestamp.fromDate(tomorrowStart), nowMs)
                );
            }

            // Calculate new streak
            let newStreak = 1;
            if (lastCheckin) {
                const lastDate = new Date(lastCheckin);
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (lastCheckin === yesterdayStr) {
                    // Consecutive day - increment streak
                    newStreak = currentStreak + 1;
                }
                // Else: streak resets to 1
            }

            // Calculate reward with streak bonus (cap at 7x)
            const cappedStreak = Math.min(newStreak, 7);
            const reward = BASE_REWARD + (STREAK_BONUS * (cappedStreak - 1));

            // Write Phase
            transaction.update(userRef, {
                lastCheckinDate: todayStr,
                checkinStreak: newStreak,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const nextAvailableAt = admin.firestore.Timestamp.fromMillis(nowMs + TASK_CHECKIN_COOLDOWN_MS);
            transaction.set(cooldownRef, {
                tasks: {
                    lastUsedAt: nowTs,
                    nextAvailableAt
                }
            }, { merge: true });

            // Create or update wallet
            if (!walletDoc.exists) {
                transaction.set(walletRef, {
                    userId,
                    coinBalance: reward,
                    cashBalance: 0,
                    totalEarnings: reward,
                    totalWithdrawals: 0,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                transaction.update(walletRef, {
                    coinBalance: admin.firestore.FieldValue.increment(reward),
                    totalEarnings: admin.firestore.FieldValue.increment(reward),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // Log transaction
            const txRef = db.collection('transactions').doc();
            transaction.set(txRef, {
                userId,
                type: 'DAILY_CHECKIN',
                amount: reward,
                currency: 'COIN',
                description: `Daily Check-in (Day ${newStreak} streak)`,
                status: 'COMPLETED',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Log completion
            const completionId = `${userId}_CHECKIN_${todayStr}`;
            const completionRef = db.collection('task_completions').doc(completionId);
            transaction.set(completionRef, {
                userId,
                taskId: 'DAILY_CHECKIN',
                taskTitle: 'Daily Check-in',
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                reward,
                rewardType: 'COIN',
                streak: newStreak
            });

            return {
                success: true,
                reward,
                streak: newStreak,
                message: `Day ${newStreak} streak! Earned ${reward} coins.`,
                cooldown: buildCooldown(nextAvailableAt, nowMs)
            };
        });
    } catch (error: unknown) {
        console.error("Daily Checkin Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Check-in failed.');
    }
}));
