'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AdGuard } from '@/components/ads/AdGuard';
import { Loader2, CheckCircle } from 'lucide-react';
import { Task } from '@/types/task';
import { Button } from '@/components/ui/Button';
import { TaskCard } from '@/components/tasks/TaskCard';
import { useRouter } from 'next/navigation';
import { taskService } from '@/services/task.service';
import { completeTask } from '@/services/taskService';

const DEBUG_MODE = false; // Set to true for development debugging only

export default function TasksPage() {
  const { user } = useAuth();
  const router = useRouter(); // Use Next.js router
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Record<string, number>>({}); // taskId -> completedAt (ms)
  const [serverCooldowns, setServerCooldowns] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Active Task State
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const getErrorMessage = (error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  };

  const fetchTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setCompletions({});
      setServerCooldowns({});
      setLoading(false);
      return;
    }

    try {
      const [visibleTasks, completionMap] = await Promise.all([
        taskService.getVisibleTasks(50),
        taskService.getRecentCompletionMap(user.uid, 40),
      ]);

      if (DEBUG_MODE) {
        console.log(`[TasksPage] Visible tasks fetched: ${visibleTasks.length}`);
      }

      setTasks(visibleTasks);
      setCompletions(completionMap);
      setServerCooldowns({});
    } catch (err) {
      console.error("Failed to fetch tasks/completions", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 1. Start Task
  const handleStartTask = async (task: Task) => {
    setProcessing(true);
    setMessage(null);
    try {
      // For Surveys, redirect to survey runner
      const taskType = String(task.type || '').toUpperCase();
      if (taskType === 'SURVEY') {
        router.push(`/dashboard/user/tasks/${task.id}`); // Soft navigation
        return;
      }

      // For Video tasks, redirect to video runner
      if (taskType === 'WATCH_VIDEO' || taskType === 'VIDEO') {
        router.push(`/dashboard/user/tasks/video/${task.id}`); // Soft navigation
        return;
      }

      // For Actions (Video/Web)
      setActiveTask(task); // This triggers the Modal/View with AdGuard

    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to start task') });
    } finally {
      setProcessing(false);
    }
  };

  // 2. Complete Task (Called by AdGuard or Survey End)
  const handleCompleteTask = async () => {
    if (!activeTask) return;
    setProcessing(true);
    try {
      const data = await completeTask(activeTask.id);

      setMessage({ type: 'success', text: `Success! You earned ${data.reward} ${data.rewardType}!` });

      // Update local state instead of reload
      const now = Date.now();
      setCompletions(prev => ({ ...prev, [activeTask.id]: now }));

      // Close active view after delay
      setTimeout(() => {
        setActiveTask(null);
        setMessage(null);
        fetchTasks(); // Soft refresh data
      }, 2000);

    } catch (error: unknown) {
      console.error(error);
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to claim reward.') });
    } finally {
      setProcessing(false);
    }
  };

  // --- MAIN RENDER ---

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Earn Coins</h1>
        <p className="text-gray-500">Complete simple tasks to earn rewards instantly.</p>

        {DEBUG_MODE && (
          <div className="mt-4 p-4 bg-gray-900 text-green-400 font-mono text-xs rounded-lg">
            <p>User ID: {user?.uid || 'Not Logged In'}</p>
            <p>Tasks Fetched: {tasks.length}</p>
          </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* ACTIVE TASK OVERLAY */}
      {activeTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold">{activeTask.title}</h3>
              <p className="text-gray-500 text-sm mt-1">{activeTask.description}</p>
            </div>
            <div className="p-6">
              {/* AD GUARD HANDLES THE TIMER & FINAL ACTION */}
              <AdGuard
                onAdComplete={handleCompleteTask}
                timerSeconds={activeTask.minDuration || 15}
              >
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleCompleteTask}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2" size={18} />}
                  Claim Reward
                </Button>
              </AdGuard>
            </div>
            <div className="p-4 bg-gray-50 text-center text-xs text-gray-400">
              Do not close this window or you will lose your progress.
            </div>
          </div>
        </div>
      )}

      {/* TASK LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onStart={handleStartTask}
            disabled={!!activeTask}
            lastCompletedAt={completions[task.id]}
            serverCooldownSeconds={serverCooldowns[task.id]}
          />
        ))}

        {tasks.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed">
            No tasks available right now. Check back later!
          </div>
        )}
      </div>
    </div>
  );
}
