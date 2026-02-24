// File: services/taskService.ts
/**
 * Task Service (API/Turso-backed)
 */

import { apiClient, type PaginatedResponse } from '@/lib/api/client';
import type { ApiTask, ApiTaskCompletion } from '@/lib/api/types';

export async function fetchActiveTasks(type?: string): Promise<ApiTask[]> {
    const params = type ? `?type=${encodeURIComponent(type)}` : '';
    const res = await apiClient.get<{ data: ApiTask[] }>(`/api/tasks${params}`);
    return res.data;
}

export async function fetchTask(id: string): Promise<ApiTask | null> {
    try {
        const res = await apiClient.get<{ data: ApiTask }>(`/api/tasks/${id}`);
        return res.data;
    } catch (error: any) {
        if (error?.statusCode === 404) return null;
        throw error;
    }
}

export async function fetchCompletedTasks(
    _userId: string,
    page = 1,
    pageLimit = 20
): Promise<PaginatedResponse<ApiTaskCompletion>> {
    return apiClient.get<PaginatedResponse<ApiTaskCompletion>>(
        `/api/tasks/completed?page=${page}&limit=${pageLimit}`
    );
}

export async function completeTask(
    taskId: string,
    data?: Record<string, any>
): Promise<{ id: string; reward: number; rewardType: string }> {
    const res = await apiClient.post<{ data: { id: string; reward: number; rewardType: string } }>(
        `/api/tasks/${taskId}/complete`,
        { data }
    );
    return res.data;
}

