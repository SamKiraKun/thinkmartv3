import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const LUCKY_BOX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type CooldownState = {
    nextAvailableAt: string | null;
    secondsRemaining: number;
};

function toMillis(value: unknown): number {
    if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    if (value && typeof (value as { seconds?: unknown }).seconds === 'number') {
        return Number((value as { seconds: number }).seconds) * 1000;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return 0;
}

function buildCooldownState(nextAvailableAt: unknown, nowMs: number): CooldownState {
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

function buildCooldownError(action: string, nextAvailableAt: unknown, nowMs: number): functions.https.HttpsError {
    return new functions.https.HttpsError(
        'resource-exhausted',
        `${action} is on cooldown. Please wait before trying again.`,
        buildCooldownState(nextAvailableAt, nowMs)
    );
}

function randomWeightedPrize<T extends { weight: number }>(segments: T[]): T {
    const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
    let random = Math.random() * totalWeight;
    for (const segment of segments) {
        if (random < segment.weight) {
            return segment;
        }
        random -= segment.weight;
    }
    return segments[0];
}

/**
 * Legacy-compatible Spin Wheel callable moved into gamification domain module.
 */
export const spinWheel = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    const userId = context.auth.uid;
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();

    try {
        return await db.runTransaction(async (t) => {
            const cooldownRef = db.doc(`cooldowns/${userId}`);
            const walletRef = db.doc(`wallets/${userId}`);

            const [cooldownSnap, walletSnap] = await Promise.all([
                t.get(cooldownRef),
                t.get(walletRef)
            ]);

            const cooldownData = cooldownSnap.exists ? cooldownSnap.data() : {};
            const spinData = cooldownData?.spin || {};
            const nextSpinAt = spinData?.nextAvailableAt;
            if (toMillis(nextSpinAt) > nowMs) {
                throw buildCooldownError('Spin Wheel', nextSpinAt, nowMs);
            }

            const consecutiveLosses = Number(spinData?.consecutiveLosses || 0);

            // Prize segments with weights
            const segments = [
                { label: 'Better Luck Next Time', value: 0, weight: 40 },
                { label: '50 Coins', value: 50, weight: 30 },
                { label: '100 Coins', value: 100, weight: 20 },
                { label: '500 Coins', value: 500, weight: 8 },
                { label: 'JACKPOT (1000)', value: 1000, weight: 2 }
            ];

            // PITY SYSTEM: If 2 consecutive losses, force a win
            let prize;
            const forcedWin = consecutiveLosses >= 2;

            if (forcedWin) {
                const winningSegments = segments.filter(s => s.value > 0);
                prize = randomWeightedPrize(winningSegments);
            } else {
                prize = randomWeightedPrize(segments);
            }

            const newConsecutiveLosses = prize.value > 0 ? 0 : consecutiveLosses + 1;
            const nextAvailableAt = admin.firestore.Timestamp.fromMillis(nowMs + SPIN_COOLDOWN_MS);

            t.set(cooldownRef, {
                spin: {
                    lastUsedAt: now,
                    nextAvailableAt,
                    consecutiveLosses: newConsecutiveLosses,
                }
            }, { merge: true });

            if (prize.value > 0) {
                if (!walletSnap.exists) {
                    t.set(walletRef, {
                        userId,
                        coinBalance: prize.value,
                        cashBalance: 0,
                        totalEarnings: prize.value,
                        totalWithdrawals: 0,
                        updatedAt: now
                    });
                } else {
                    t.update(walletRef, {
                        coinBalance: admin.firestore.FieldValue.increment(prize.value),
                        updatedAt: now
                    });
                }

                const txRef = db.collection('transactions').doc();
                t.set(txRef, {
                    userId,
                    coinAmount: prize.value,
                    type: 'credit',
                    category: 'game',
                    description: `Spin Wheel: ${prize.label}${forcedWin ? ' (Lucky!)' : ''}`,
                    timestamp: now,
                    createdAt: now
                });
            }

            return {
                success: true,
                prize,
                pityTriggered: forcedWin,
                cooldown: buildCooldownState(nextAvailableAt, nowMs)
            };
        });
    } catch (error: unknown) {
        functions.logger.error('spinWheel failed', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Spin failed. Please try again.');
    }
});

/**
 * Legacy-compatible Lucky Box callable moved into gamification domain module.
 */
export const openLuckyBox = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    const userId = context.auth.uid;
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();

    try {
        return await db.runTransaction(async (t) => {
            const cooldownRef = db.doc(`cooldowns/${userId}`);
            const walletRef = db.doc(`wallets/${userId}`);

            const [cooldownSnap, walletSnap] = await Promise.all([
                t.get(cooldownRef),
                t.get(walletRef)
            ]);

            const cooldownData = cooldownSnap.exists ? cooldownSnap.data() : {};
            const luckyData = cooldownData?.luckyBox || {};
            const nextLuckyAt = luckyData?.nextAvailableAt;
            if (toMillis(nextLuckyAt) > nowMs) {
                throw buildCooldownError('Lucky Box', nextLuckyAt, nowMs);
            }

            const reward = [100, 200, 500, 1000][Math.floor(Math.random() * 4)];
            const nextAvailableAt = admin.firestore.Timestamp.fromMillis(nowMs + LUCKY_BOX_COOLDOWN_MS);

            t.set(cooldownRef, {
                luckyBox: {
                    lastUsedAt: now,
                    nextAvailableAt,
                }
            }, { merge: true });

            if (!walletSnap.exists) {
                t.set(walletRef, {
                    userId,
                    coinBalance: reward,
                    cashBalance: 0,
                    totalEarnings: reward,
                    totalWithdrawals: 0,
                    updatedAt: now
                });
            } else {
                t.update(walletRef, {
                    coinBalance: admin.firestore.FieldValue.increment(reward),
                    updatedAt: now
                });
            }

            const txRef = db.collection('transactions').doc();
            t.set(txRef, {
                userId,
                coinAmount: reward,
                type: 'credit',
                category: 'game',
                description: `Lucky Box: ${reward} Coins`,
                timestamp: now,
                createdAt: now
            });

            return {
                success: true,
                reward,
                cooldown: buildCooldownState(nextAvailableAt, nowMs)
            };
        });
    } catch (error: unknown) {
        functions.logger.error('openLuckyBox failed', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Lucky box failed. Please try again.');
    }
});

/**
 * Returns current cooldown state for spin, lucky box, and tasks actions.
 */
export const getActionCooldowns = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const nowMs = Date.now();
    const cooldownDoc = await db.doc(`cooldowns/${userId}`).get();
    const data = cooldownDoc.exists ? cooldownDoc.data() : {};

    return {
        spin: buildCooldownState(data?.spin?.nextAvailableAt, nowMs),
        luckyBox: buildCooldownState(data?.luckyBox?.nextAvailableAt, nowMs),
        tasks: buildCooldownState(data?.tasks?.nextAvailableAt, nowMs),
    };
});
