import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requirePermission, writeAuditLog } from "./helpers";

const db = admin.firestore();

// ============================================================================
// TASK MANAGEMENT (CRUD)
// ============================================================================

interface TaskData {
    id: string;
    title: string;
    description: string;
    type: "video" | "survey" | "website" | "social" | "app";
    rewardAmount: number;
    rewardType: "coins" | "cash";
    reward?: number; // Legacy compatibility with user runtime
    duration?: number; // in seconds for video tasks
    minDuration?: number; // Legacy compatibility
    url?: string;
    videoUrl?: string;
    youtubeId?: string;
    instructions?: string;
    questions?: { text: string; options: string[]; timeLimit: number }[];
    isActive: boolean;
    isArchived: boolean;
    dailyLimit?: number;
    totalCompletions: number;
    priority: number;
    targetRoles?: string[];
    targetCities?: string[];
    createdAt: string;
    updatedAt?: string;
    createdBy?: string;
}

interface TaskPageCursor {
    priority: number;
    id: string;
}

interface TaskCursorPageResponse {
    tasks: TaskData[];
    nextCursor: TaskPageCursor | null;
    hasMore: boolean;
}

/**
 * Get tasks with filters for admin management
 */
export const getAdminTasks = functions.https.onCall(
    async (
        data: {
            type?: string;
            status?: "active" | "inactive" | "archived";
            search?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<{ tasks: TaskData[]; total: number; hasMore: boolean }> => {
        functions.logger.warn("[DEPRECATED] getAdminTasks called - migrate to getAdminTasksPage", {
            uid: context.auth?.uid,
        });
        await requirePermission(context, "tasks.manage");

        const { type, status, search, page = 1, limit = 20 } = data;
        const validLimit = Math.min(Math.max(1, Number(limit || 20)), 100);
        const validPage = Math.max(1, Number(page || 1));

        let query: admin.firestore.Query = db.collection("tasks")
            .orderBy("priority", "desc");

        if (type) {
            query = query.where("type", "==", type);
        }

        if (status === "active") {
            query = query.where("isActive", "==", true).where("isArchived", "==", false);
        } else if (status === "inactive") {
            query = query.where("isActive", "==", false).where("isArchived", "==", false);
        } else if (status === "archived") {
            query = query.where("isArchived", "==", true);
        }

        // Get total count
        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

        // Legacy page pagination without Firestore offset.
        let pageCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        let pageDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        let hasMore = false;

        for (let currentPage = 1; currentPage <= validPage; currentPage += 1) {
            let pageQuery = query
                .orderBy(admin.firestore.FieldPath.documentId(), "desc");

            if (pageCursor) {
                pageQuery = pageQuery.startAfter(
                    Number(pageCursor.get("priority") || 0),
                    pageCursor.id
                );
            }

            const snapshot = await pageQuery.limit(validLimit + 1).get();
            const docs = snapshot.docs.slice(0, validLimit);
            hasMore = snapshot.docs.length > validLimit;

            if (currentPage === validPage) {
                pageDocs = docs;
                break;
            }

            if (!docs.length || !hasMore) {
                pageDocs = [];
                hasMore = false;
                break;
            }

            pageCursor = docs[docs.length - 1];
        }

        let tasks: TaskData[] = pageDocs.map((doc) => ({ id: doc.id, ...doc.data() } as TaskData));

        // Client-side search filter (for title)
        if (search) {
            const searchLower = search.toLowerCase();
            tasks = tasks.filter(t =>
                t.title.toLowerCase().includes(searchLower) ||
                t.description?.toLowerCase().includes(searchLower)
            );
        }

        return {
            tasks,
            total,
            hasMore,
        };
    }
);

/**
 * Returns cursor-paginated tasks list for scalable admin listing.
 */
export const getAdminTasksPage = functions.https.onCall(
    async (
        data: {
            type?: string;
            status?: "active" | "inactive" | "archived";
            search?: string;
            pageSize?: number;
            cursor?: TaskPageCursor | null;
        },
        context
    ): Promise<TaskCursorPageResponse> => {
        await requirePermission(context, "tasks.manage");

        const {
            type,
            status,
            search,
            pageSize = 20,
            cursor
        } = data;

        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        let query: admin.firestore.Query = db.collection("tasks");

        if (type) {
            query = query.where("type", "==", type);
        }

        if (status === "active") {
            query = query.where("isActive", "==", true).where("isArchived", "==", false);
        } else if (status === "inactive") {
            query = query.where("isActive", "==", false).where("isArchived", "==", false);
        } else if (status === "archived") {
            query = query.where("isArchived", "==", true);
        }

        query = query
            .orderBy("priority", "desc")
            .orderBy(admin.firestore.FieldPath.documentId(), "desc");

        if (cursor?.id) {
            query = query.startAfter(Number(cursor.priority || 0), cursor.id);
        }

        const snapshot = await query.limit(limit + 1).get();
        const pageDocs = snapshot.docs.slice(0, limit);
        const hasMore = snapshot.docs.length > limit;

        let tasks: TaskData[] = pageDocs.map((doc) => ({ id: doc.id, ...doc.data() } as TaskData));

        if (search?.trim()) {
            const q = search.trim().toLowerCase();
            tasks = tasks.filter((task) =>
                task.title?.toLowerCase().includes(q) ||
                task.description?.toLowerCase().includes(q)
            );
        }

        const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
        const nextCursor = hasMore && lastDoc
            ? {
                priority: Number(lastDoc.get("priority") || 0),
                id: lastDoc.id
            }
            : null;

        return {
            tasks,
            nextCursor,
            hasMore
        };
    }
);

/**
 * Create a new task
 */
export const createTask = functions.https.onCall(
    async (
        data: {
            title: string;
            description: string;
            type: TaskData["type"];
            rewardAmount: number;
            rewardType: "coins" | "cash";
            duration?: number;
            minDuration?: number;
            url?: string;
            videoUrl?: string;
            youtubeId?: string;
            instructions?: string;
            questions?: { text: string; options: string[]; timeLimit: number }[];
            dailyLimit?: number;
            priority?: number;
            targetRoles?: string[];
            targetCities?: string[];
        },
        context
    ): Promise<{ success: boolean; taskId: string }> => {
        const adminContext = await requirePermission(context, "tasks.manage");

        const {
            title,
            description,
            type,
            rewardAmount,
            rewardType,
            duration,
            minDuration,
            url,
            videoUrl,
            youtubeId,
            instructions,
            questions,
            dailyLimit,
            priority = 0,
            targetRoles,
            targetCities,
        } = data;

        // Validation
        if (!title || title.length < 3) {
            throw new functions.https.HttpsError("invalid-argument", "Title must be at least 3 characters");
        }

        if (!type || !["video", "survey", "website", "social", "app"].includes(type)) {
            throw new functions.https.HttpsError("invalid-argument", "Invalid task type");
        }

        if (rewardAmount <= 0) {
            throw new functions.https.HttpsError("invalid-argument", "Reward amount must be positive");
        }

        if (type === "video" && (!duration || duration <= 0)) {
            const effectiveDuration = minDuration ?? duration;
            if (!effectiveDuration || effectiveDuration <= 0) {
                throw new functions.https.HttpsError("invalid-argument", "Video tasks require a positive duration");
            }
        }

        const now = new Date().toISOString();
        const taskData: Omit<TaskData, "id"> = {
            title,
            description: description || "",
            type,
            rewardAmount,
            reward: rewardAmount,
            rewardType: rewardType || "coins",
            duration: minDuration ?? duration,
            minDuration: minDuration ?? duration,
            url: url ?? videoUrl,
            videoUrl,
            youtubeId,
            instructions,
            questions,
            isActive: true,
            isArchived: false,
            dailyLimit,
            totalCompletions: 0,
            priority,
            targetRoles,
            targetCities,
            createdAt: now,
            createdBy: adminContext.uid,
        };

        const docRef = await db.collection("tasks").add(taskData);

        // Audit log
        await writeAuditLog(
            "TASK_CREATED",
            adminContext.uid,
            docRef.id,
            "settings",
            {
                title,
                type,
                rewardAmount,
            }
        );

        return { success: true, taskId: docRef.id };
    }
);

/**
 * Update an existing task
 */
export const updateTask = functions.https.onCall(
    async (
        data: {
            taskId: string;
            title?: string;
            description?: string;
            rewardAmount?: number;
            rewardType?: "coins" | "cash";
            duration?: number;
            url?: string;
            instructions?: string;
            isActive?: boolean;
            dailyLimit?: number;
            priority?: number;
            targetRoles?: string[];
            targetCities?: string[];
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "tasks.manage");

        const { taskId, ...updates } = data;

        if (!taskId) {
            throw new functions.https.HttpsError("invalid-argument", "Task ID required");
        }

        const taskRef = db.collection("tasks").doc(taskId);
        const taskDoc = await taskRef.get();

        if (!taskDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Task not found");
        }

        const currentTask = taskDoc.data() as TaskData;

        // Build sanitized updates
        const sanitizedUpdates: Partial<TaskData> = {
            updatedAt: new Date().toISOString(),
        };

        const allowedFields = [
            "title", "description", "rewardAmount", "rewardType",
            "duration", "url", "instructions", "isActive",
            "dailyLimit", "priority", "targetRoles", "targetCities"
        ];

        for (const field of allowedFields) {
            if (updates[field as keyof typeof updates] !== undefined) {
                (sanitizedUpdates as any)[field] = updates[field as keyof typeof updates];
            }
        }

        await taskRef.update(sanitizedUpdates);

        // Audit log
        await writeAuditLog(
            "TASK_UPDATED",
            adminContext.uid,
            taskId,
            "settings",
            {
                previousTitle: currentTask.title,
                changes: Object.keys(sanitizedUpdates).filter(k => k !== "updatedAt"),
            }
        );

        return { success: true };
    }
);

/**
 * Archive a task (soft delete)
 */
export const archiveTask = functions.https.onCall(
    async (
        data: { taskId: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "tasks.manage");

        const { taskId } = data;

        if (!taskId) {
            throw new functions.https.HttpsError("invalid-argument", "Task ID required");
        }

        const taskRef = db.collection("tasks").doc(taskId);
        const taskDoc = await taskRef.get();

        if (!taskDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Task not found");
        }

        const task = taskDoc.data() as TaskData;

        await taskRef.update({
            isArchived: true,
            isActive: false,
            updatedAt: new Date().toISOString(),
        });

        // Audit log
        await writeAuditLog(
            "TASK_ARCHIVED",
            adminContext.uid,
            taskId,
            "settings",
            {
                title: task.title,
                type: task.type,
            }
        );

        return { success: true };
    }
);
