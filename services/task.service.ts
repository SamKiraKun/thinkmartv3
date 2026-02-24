import {
  fetchTask,
  fetchActiveTasks,
  fetchCompletedTasks,
} from '@/services/taskService';
import { Task } from '@/types/task';

interface TaskCompletion {
  id: string;
  userId: string;
  taskId: string;
  completedAt: Date;
  reward: number;
  rewardType: string;
}

function normalizeTask(apiTask: any): Task {
  return {
    id: apiTask.id,
    title: apiTask.title,
    description: apiTask.description,
    type: apiTask.type,
    reward: Number(apiTask.reward || 0),
    rewardType: (apiTask.rewardType || 'COIN').toUpperCase(),
    frequency: apiTask.frequency,
    minDuration: apiTask.minDuration ?? undefined,
    cooldownHours: apiTask.cooldownHours ?? undefined,
    maxCompletionsPerDay: apiTask.maxCompletions ?? apiTask.maxCompletionsPerDay ?? null,
    possibleRewards: apiTask.possibleRewards ?? undefined,
    questions: apiTask.questions ?? undefined,
    isActive: Boolean(apiTask.isActive),
    createdAt: new Date(apiTask.createdAt || Date.now()),
  } as Task;
}

export const taskService = {
  async getTask(taskId: string): Promise<Task | null> {
    const task = await fetchTask(taskId);
    return task ? normalizeTask(task) : null;
  },

  async getActiveTasks(): Promise<Task[]> {
    const tasks = await fetchActiveTasks();
    return tasks.map(normalizeTask);
  },

  async getVisibleTasks(limitCount = 50): Promise<Task[]> {
    const tasks = await fetchActiveTasks();
    return tasks
      .map(normalizeTask)
      .filter((task) => {
        const t = String(task.type || '').toUpperCase();
        return t !== 'SPIN' && t !== 'LUCKY_BOX';
      })
      .slice(0, limitCount);
  },

  async getUserCompletions(_userId: string, limitCount = 100): Promise<TaskCompletion[]> {
    const res = await fetchCompletedTasks('self', 1, limitCount);
    return res.data.map((row) => ({
      id: row.id,
      userId: 'self',
      taskId: row.taskId,
      completedAt: new Date(row.completedAt),
      reward: Number(row.rewardedAmount || row.reward || 0),
      rewardType: row.rewardType,
    }));
  },

  async getRecentCompletionMap(userId: string, limitCount = 40): Promise<Record<string, number>> {
    const completions = await this.getUserCompletions(userId, limitCount);
    const completionMap: Record<string, number> = {};
    for (const completion of completions) {
      if (!completion.taskId || completionMap[completion.taskId]) continue;
      completionMap[completion.taskId] = completion.completedAt.getTime();
    }
    return completionMap;
  },

  async getCompletionCount(userId: string, taskId: string): Promise<number> {
    const completions = await this.getUserCompletions(userId, 200);
    return completions.filter((c) => c.taskId === taskId).length;
  },
};
