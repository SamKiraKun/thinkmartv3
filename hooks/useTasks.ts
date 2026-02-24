// File: ThinkMart/hooks/useTasks.ts
/**
 * useTasks Hook - Fetches tasks and user completions
 * Task completion actions are handled via Cloud Functions (httpsCallable)
 */

"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { taskService } from "@/services/task.service";
import { Task, UserTaskCompletion } from "@/types/task";

export const useTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<UserTaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchTasks = async () => {
      try {
        const activeTasks = await taskService.getVisibleTasks(50);
        setTasks(activeTasks);

        const completionMap = await taskService.getRecentCompletionMap(user.uid, 100);
        const mappedCompletions: UserTaskCompletion[] = Object.entries(completionMap).map(([taskId, ms], idx) => ({
          id: `${taskId}:${idx}`,
          userId: user.uid,
          taskId,
          completedAt: new Date(ms),
          reward: 0,
        }));
        setCompletedTasks(mappedCompletions);
      } catch (error) {
        // Handle silently - tasks will be empty
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [user]);

  // Note: Task completion is handled directly via Cloud Functions in components
  // using httpsCallable(functions, 'rewardTask')

  return { tasks, completedTasks, loading };
};
