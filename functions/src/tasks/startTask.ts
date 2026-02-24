
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { StartTaskSchema, withValidation } from '../lib/validation';

const db = admin.firestore();
const TASK_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 Hours

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

export const startTask = functions.https.onCall(withValidation(StartTaskSchema, async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userId = context.auth.uid;
    const { taskId } = data;
    const nowMs = Date.now();

    // 1. Check server-side cooldown from the canonical cooldowns collection
    const cooldownRef = db.collection('cooldowns').doc(userId);
    const cooldownDoc = await cooldownRef.get();
    const cooldownData = cooldownDoc.exists ? cooldownDoc.data() : {};
    const taskCooldown = cooldownData?.taskStart || {};

    // Check per-task cooldown
    const perTaskNext = taskCooldown?.[taskId]?.nextAvailableAt;
    if (toMillis(perTaskNext) > nowMs) {
        throw new functions.https.HttpsError(
            'resource-exhausted',
            'Cooldown active. Please wait before trying again.',
            buildCooldown(perTaskNext, nowMs)
        );
    }

    // 2. Also check task_completions for backward compatibility with 2h cooldown
    const completionsRef = db.collection('task_completions');
    const q = completionsRef
        .where('userId', '==', userId)
        .where('taskId', '==', taskId)
        .orderBy('completedAt', 'desc')
        .limit(1);

    const snapshot = await q.get();

    if (!snapshot.empty) {
        const lastCompletion = snapshot.docs[0].data();
        const completedAt = lastCompletion.completedAt?.toDate().getTime() || 0;

        if (nowMs - completedAt < TASK_COOLDOWN_MS) {
            const nextAt = completedAt + TASK_COOLDOWN_MS;
            throw new functions.https.HttpsError(
                'resource-exhausted',
                'Cooldown active. Please wait before trying again.',
                buildCooldown(nextAt, nowMs)
            );
        }
    }

    // 3. Create session record
    const sessionId = `session_${userId}_${taskId}_${Date.now()}`;

    try {
        const nowTs = admin.firestore.Timestamp.now();
        const nextAvailableAt = admin.firestore.Timestamp.fromMillis(nowMs + TASK_COOLDOWN_MS);

        await db.collection('task_sessions').doc(sessionId).set({
            userId,
            taskId,
            status: 'IN_PROGRESS',
            currentStep: 0,
            answers: {},
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastActionAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Write cooldown for this specific task
        await cooldownRef.set({
            taskStart: {
                [taskId]: {
                    lastUsedAt: nowTs,
                    nextAvailableAt,
                }
            }
        }, { merge: true });

        return {
            success: true,
            sessionId,
            message: 'Task session started.',
            cooldown: buildCooldown(nextAvailableAt, nowMs),
        };
    } catch (error: unknown) {
        console.error("Start Task Error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            error instanceof Error ? error.message : 'Failed to start task session.'
        );
    }
}));
