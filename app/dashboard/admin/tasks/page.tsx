'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  archiveAdminTask,
  fetchAdminTasks,
  updateAdminTask,
  type AdminTaskItem,
} from '@/services/adminService';
import {
  Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw,
  Search, Filter, Video, FileText, Globe, Share2, Smartphone,
  Archive, ChevronLeft, ChevronRight, AlertTriangle, Coins, Banknote
} from 'lucide-react';

interface TaskData {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'survey' | 'website' | 'social' | 'app';
  rewardAmount: number;
  rewardType: 'coins' | 'cash';
  duration?: number;
  url?: string;
  isActive: boolean;
  isArchived: boolean;
  dailyLimit?: number;
  totalCompletions: number;
  priority: number;
  createdAt: string;
}

interface TasksCursor {
  page: number;
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type TypeFilter = '' | 'video' | 'survey' | 'website' | 'social' | 'app';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <Video className="w-4 h-4" />,
  survey: <FileText className="w-4 h-4" />,
  website: <Globe className="w-4 h-4" />,
  social: <Share2 className="w-4 h-4" />,
  app: <Smartphone className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  video: 'bg-red-100 text-red-700',
  survey: 'bg-indigo-100 text-indigo-700',
  website: 'bg-blue-100 text-blue-700',
  social: 'bg-pink-100 text-pink-700',
  app: 'bg-green-100 text-green-700',
};

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<TasksCursor | null>(null);
  const [cursorStack, setCursorStack] = useState<(TasksCursor | null)[]>([null]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [archiveTaskId, setArchiveTaskId] = useState<string | null>(null);

  const pageSize = 20;
  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  useEffect(() => {
    const initialStack: (TasksCursor | null)[] = [null];
    setCursorStack(initialStack);
    void fetchTasks(null, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  const fetchTasks = async (cursor: TasksCursor | null, pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const pageValue = cursor?.page || pageNum || 1;
      const result = await fetchAdminTasks(pageValue, pageSize, {
        type: typeFilter || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined,
      });

      setTasks((result.data || []) as unknown as TaskData[]);
      setNextCursor(result.pagination?.hasNext ? { page: pageValue + 1 } : null);
      setHasMore(Boolean(result.pagination?.hasNext));
      setPage(pageNum);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load tasks'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    const initialStack: (TasksCursor | null)[] = [null];
    setCursorStack(initialStack);
    void fetchTasks(null, 1);
  };

  const toggleStatus = async (taskId: string, currentStatus: boolean) => {
    setActionLoading(taskId);
    try {
      await updateAdminTask(taskId, { isActive: !currentStatus });
      // Update local state
      setTasks(tasks.map(t => t.id === taskId ? { ...t, isActive: !currentStatus } : t));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update task'));
    } finally {
      setActionLoading(null);
    }
  };

  const archiveTask = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await archiveAdminTask(taskId, `task_archive_${taskId}_${Date.now()}`);
      // Remove from list or refetch
      setTasks(tasks.filter(t => t.id !== taskId));
      setArchiveTaskId(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to archive task'));
    } finally {
      setActionLoading(null);
    }
  };

  const getTypeIcon = (type: string) => TYPE_ICONS[type] || <FileText className="w-4 h-4" />;
  const getTypeColor = (type: string) => TYPE_COLORS[type] || 'bg-gray-100 text-gray-700';

  const handleNextPage = () => {
    if (!hasMore || !nextCursor) return;
    const nextStack = [...cursorStack, nextCursor];
    setCursorStack(nextStack);
    void fetchTasks(nextCursor, nextStack.length);
  };

  const handlePrevPage = () => {
    if (page <= 1) return;
    const prevStack = cursorStack.slice(0, -1);
    const normalizedStack = prevStack.length ? prevStack : [null];
    const prevCursor = normalizedStack[normalizedStack.length - 1] ?? null;
    setCursorStack(normalizedStack);
    void fetchTasks(prevCursor, normalizedStack.length);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Task Management</h1>
        <div className="flex gap-3">
          <Link
            href="/dashboard/admin/tasks/create-video"
            className="px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 hover:bg-red-700 transition text-sm font-medium"
          >
            <Plus size={18} /> Video Task
          </Link>
          <Link
            href="/dashboard/admin/tasks/create"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition text-sm font-medium"
          >
            <Plus size={18} /> Survey Task
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <span className="text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-700">×</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Search */}
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            Search
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Types</option>
          <option value="video">Video</option>
          <option value="survey">Survey</option>
          <option value="website">Website</option>
          <option value="social">Social</option>
          <option value="app">App</option>
        </select>

        {/* Refresh */}
        <button
          onClick={() => {
            const currentCursor = cursorStack[cursorStack.length - 1] ?? null;
            void fetchTasks(currentCursor, cursorStack.length);
          }}
          disabled={loading}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>Loaded: <strong className="text-gray-900">{tasks.length}</strong> tasks</span>
        {page > 1 && <span>Page {page}</span>}
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-600 text-sm">
            <tr>
              <th className="px-6 py-4">Task</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Reward</th>
              <th className="px-6 py-4">Completions</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
                  <span className="text-gray-500">Loading tasks...</span>
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No tasks found. Create one to get started.
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{task.title}</div>
                    {task.description && (
                      <div className="text-sm text-gray-500 truncate max-w-xs">{task.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getTypeColor(task.type)}`}>
                      {getTypeIcon(task.type)}
                      {task.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      {task.rewardType === 'coins' ? (
                        <Coins className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Banknote className="w-4 h-4 text-green-500" />
                      )}
                      <span className={`font-bold ${task.rewardType === 'coins' ? 'text-amber-600' : 'text-green-600'}`}>
                        {task.rewardAmount}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {task.totalCompletions}
                    {task.dailyLimit && <span className="text-gray-400"> / {task.dailyLimit} daily</span>}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleStatus(task.id, task.isActive)}
                      disabled={actionLoading === task.id || task.isArchived}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition
                        ${task.isArchived
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : task.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                    >
                      {actionLoading === task.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : task.isArchived ? (
                        <Archive className="w-3 h-3" />
                      ) : task.isActive ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {task.isArchived ? 'Archived' : task.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {!task.isArchived && (
                        <button
                          onClick={() => setArchiveTaskId(task.id)}
                          disabled={actionLoading === task.id}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Archive task"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-2">
        <button
          onClick={handlePrevPage}
          disabled={page <= 1 || loading}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
        <button
          onClick={handleNextPage}
          disabled={!hasMore || loading}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {archiveTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setArchiveTaskId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Archive Task?</h2>
            <p className="text-sm text-gray-600 mb-4">
              This task will be marked archived and removed from the active list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setArchiveTaskId(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => archiveTask(archiveTaskId)}
                disabled={actionLoading === archiveTaskId}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === archiveTaskId ? <Loader2 size={16} className="animate-spin" /> : null}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
