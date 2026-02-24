
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { withValidation } from '../lib/validation';

const db = admin.firestore();

const SubmitSurveyAnswerSchema = z.object({
    sessionId: z.string().min(1).max(128),
    answer: z.any(),
    questionIndex: z.number().int().nonnegative()
});

export const submitSurveyAnswer = functions.https.onCall(withValidation(SubmitSurveyAnswerSchema, async (data, context) => {
    // 1. Security & Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userId = context.auth.uid;
    const { sessionId, answer, questionIndex } = data;

    try {
        await db.runTransaction(async (transaction) => {
            // 2. Fetch Session
            const sessionRef = db.collection('task_sessions').doc(sessionId);
            const sessionDoc = await transaction.get(sessionRef);

            if (!sessionDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Session not found or expired.');
            }

            const sessionData = sessionDoc.data();

            // 3. Validation
            if (sessionData?.userId !== userId) {
                throw new functions.https.HttpsError('permission-denied', 'Unauthorized session access.');
            }

            if (sessionData?.status === 'COMPLETED') {
                throw new functions.https.HttpsError('failed-precondition', 'Survey already completed.');
            }

            if (sessionData?.currentStep !== questionIndex) {
                // Allow strict or lenient check. Strict: Must match exactly.
                // Ideally, prevent skipping.
                throw new functions.https.HttpsError('failed-precondition', `Invalid question step. Expected ${sessionData?.currentStep}.`);
            }

            // 4. Time Verification (30s minimum per question)
            const lastAction = sessionData?.lastActionAt?.toMillis() || sessionData?.startedAt?.toMillis();
            const now = Date.now();
            const timeDiff = now - lastAction;

            if (timeDiff < 30000) { // 30 seconds
                throw new functions.https.HttpsError('resource-exhausted', `Please wait ${Math.ceil((30000 - timeDiff) / 1000)}s before submitting.`);
            }

            // 5. Update Session
            const answers = sessionData?.answers || {};
            answers[questionIndex] = answer;

            transaction.update(sessionRef, {
                answers: answers,
                currentStep: questionIndex + 1,
                lastActionAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true, message: 'Answer saved.' };

    } catch (error: unknown) {
        console.error("Submit Answer Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Submission failed.');
    }
}));
