import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requirePermission } from "./helpers";

const db = admin.firestore();

interface TxCursor {
    timestampMs: number;
    id: string;
}

interface AdminTransactionRow {
    id: string;
    userId: string | null;
    userName: string | null;
    fromUid: string | null;
    fromName: string | null;
    toUid: string | null;
    toName: string | null;
    amount: number;
    coinAmount: number;
    type: string;
    category: string;
    description: string;
    referenceId: string | null;
    timestampMs: number;
}

interface AdminTransactionsResponse {
    items: AdminTransactionRow[];
    nextCursor: TxCursor | null;
    hasMore: boolean;
}

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

function pickFirstString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return null;
}

function matchesCursor(row: AdminTransactionRow, cursor: TxCursor | undefined): boolean {
    if (!cursor) return true;
    if (row.timestampMs < cursor.timestampMs) return true;
    if (row.timestampMs > cursor.timestampMs) return false;
    return row.id < cursor.id;
}

function matchesSearch(row: AdminTransactionRow, search: string | undefined): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
        row.id.toLowerCase().includes(q) ||
        String(row.userId || "").toLowerCase().includes(q) ||
        String(row.userName || "").toLowerCase().includes(q) ||
        String(row.fromName || "").toLowerCase().includes(q) ||
        String(row.toName || "").toLowerCase().includes(q) ||
        String(row.description || "").toLowerCase().includes(q) ||
        String(row.referenceId || "").toLowerCase().includes(q)
    );
}

function inferCategory(rawCategory: unknown, rawType: unknown): string {
    const category = String(rawCategory || "").trim().toLowerCase();
    if (category) return category;
    const type = String(rawType || "").toLowerCase();
    if (type.includes("withdraw")) return "withdrawal";
    if (type.includes("order")) return "order";
    if (type.includes("member")) return "membership";
    if (type.includes("refund")) return "refund";
    if (type.includes("task")) return "task";
    if (type.includes("game") || type.includes("spin") || type.includes("lucky")) return "game";
    return "";
}

function deriveReferenceId(data: FirebaseFirestore.DocumentData): string | null {
    const direct = pickFirstString(
        data.referenceId,
        data.refId,
        data.orderId,
        data.orderRef,
        data.withdrawalId,
        data.requestId,
        data.paymentId
    );
    if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
    }
    return null;
}

export const getAdminTransactionsPage = functions.https.onCall(
    async (
        data: {
            pageSize?: number;
            cursor?: TxCursor | null;
            category?: string;
            search?: string;
        },
        context
    ): Promise<AdminTransactionsResponse> => {
        await requirePermission(context, "analytics.read");

        const pageSize = Math.min(Math.max(1, Number(data.pageSize || 20)), 100);
        const category = data.category ? String(data.category).trim().toLowerCase() : "";
        const search = data.search ? String(data.search).trim() : "";
        const cursor = data.cursor ?? undefined;

        // Bounded scans — prefer createdAt (most common) with timestamp fallback.
        const scanLimit = Math.max(pageSize * 4, 80);

        const readDocs = async (
            field: "timestamp" | "createdAt"
        ): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> => {
            try {
                const snapshot = await db.collection("transactions")
                    .orderBy(field, "desc")
                    .orderBy(admin.firestore.FieldPath.documentId(), "desc")
                    .limit(scanLimit)
                    .get();
                return snapshot.docs;
            } catch (error) {
                functions.logger.warn(`[getAdminTransactionsPage] Failed query ordered by '${field}'`, error);
                return [];
            }
        };

        // Fast path: try createdAt first (the canonical field going forward)
        const createdAtDocs = await readDocs("createdAt");

        // Only scan timestamp if createdAt returned fewer docs than scan limit
        // (meaning some older docs might only have timestamp)
        let timestampDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        if (createdAtDocs.length < scanLimit) {
            timestampDocs = await readDocs("timestamp");
        }

        const merged = new Map<string, AdminTransactionRow>();
        const uidCandidates = new Set<string>();

        const consumeDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            const raw = doc.data();
            const timestampMs = Math.max(toMillis(raw.timestamp), toMillis(raw.createdAt));
            const type = String(raw.type || "");
            const categoryValue = inferCategory(raw.category, raw.type);
            const userId = pickFirstString(raw.userId, raw.uid, raw.actorId);
            const fromUid = pickFirstString(raw.fromUid, raw.fromUserId, raw.senderUid, raw.senderId);
            const toUid = pickFirstString(raw.toUid, raw.toUserId, raw.receiverUid, raw.receiverId);
            const parsedAmount = Number(raw.amount || 0);
            const parsedCoinAmount = Number(raw.coinAmount || raw.points || 0);

            const row: AdminTransactionRow = {
                id: doc.id,
                userId,
                userName: null,
                fromUid,
                fromName: pickFirstString(raw.fromName, raw.senderName, raw.fromUserName),
                toUid,
                toName: pickFirstString(raw.toName, raw.receiverName, raw.toUserName),
                amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
                coinAmount: Number.isFinite(parsedCoinAmount) ? parsedCoinAmount : 0,
                type,
                category: categoryValue,
                description: String(raw.description || raw.note || raw.title || ""),
                referenceId: deriveReferenceId(raw),
                timestampMs,
            };

            if (category && row.category !== category) return;
            if (!matchesCursor(row, cursor || undefined)) return;
            if (!matchesSearch(row, search || undefined)) return;

            merged.set(doc.id, row);

            if (userId) uidCandidates.add(userId);
            if (fromUid) uidCandidates.add(fromUid);
            if (toUid) uidCandidates.add(toUid);
        };

        timestampDocs.forEach((doc) => consumeDoc(doc));
        createdAtDocs.forEach((doc) => consumeDoc(doc));

        let items = Array.from(merged.values()).sort((a, b) => {
            if (a.timestampMs !== b.timestampMs) return b.timestampMs - a.timestampMs;
            return b.id.localeCompare(a.id);
        });

        const hasMore = items.length > pageSize;
        items = items.slice(0, pageSize);

        const uidList = Array.from(uidCandidates).slice(0, 200);
        const userDocs = await Promise.all(uidList.map((uid) => db.collection("users").doc(uid).get()));
        const userNameMap = new Map(
            userDocs
                .filter((snap) => snap.exists)
                .map((snap) => {
                    const row = snap.data() || {};
                    const name = String(row.name || row.displayName || row.email || "");
                    return [snap.id, name];
                })
        );

        const hydrated = items.map((row) => ({
            ...row,
            userName: row.userName || (row.userId ? userNameMap.get(row.userId) || null : null),
            fromName: row.fromName || (row.fromUid ? userNameMap.get(row.fromUid) || null : null),
            toName: row.toName || (row.toUid ? userNameMap.get(row.toUid) || null : null),
        }));

        const last = hydrated.length ? hydrated[hydrated.length - 1] : null;
        return {
            items: hydrated,
            nextCursor: hasMore && last ? { timestampMs: last.timestampMs, id: last.id } : null,
            hasMore,
        };
    }
);
