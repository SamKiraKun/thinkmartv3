'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    archiveAdminTask,
    createAdminTask,
    fetchAdminProductsForModeration,
    fetchAdminTasks,
    updateAdminTask,
} from '@/services/adminService';
import { Plus, Trash2, CheckCircle, XCircle, Film, ShoppingBag, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

export default function AdminCMSPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'tasks' | 'products'>('tasks');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [tasksCursorStack, setTasksCursorStack] = useState<Array<{ page: number } | null>>([null]);
    const [productsCursorStack, setProductsCursorStack] = useState<Array<{ page: number } | null>>([null]);
    const [tasksNextCursor, setTasksNextCursor] = useState<{ page: number } | null>(null);
    const [productsNextCursor, setProductsNextCursor] = useState<{ page: number } | null>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
    const [archiveSubmitting, setArchiveSubmitting] = useState(false);
    const getErrorMessage = (error: unknown, fallback: string) =>
        error instanceof Error ? error.message : fallback;

    useEffect(() => {
        if (activeTab === 'tasks') {
            const cursor = tasksCursorStack[tasksCursorStack.length - 1] ?? null;
            void fetchItems(cursor, tasksCursorStack.length);
            return;
        }

        const cursor = productsCursorStack[productsCursorStack.length - 1] ?? null;
        void fetchItems(cursor, productsCursorStack.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const fetchItems = async (
        cursor: { page: number } | null,
        pageNumber: number
    ) => {
        setLoading(true);
        try {
            if (activeTab === 'tasks') {
                const pageValue = cursor?.page || pageNumber || 1;
                const result = await fetchAdminTasks(pageValue, 30);
                setItems(result.data || []);
                setTasksNextCursor(result.pagination?.hasNext ? { page: pageValue + 1 } : null);
                setHasMore(Boolean(result.pagination?.hasNext));
                setPage(pageNumber);
                return;
            }

            const pageValue = cursor?.page || pageNumber || 1;
            const result = await fetchAdminProductsForModeration(pageValue, 30);
            setItems(result.data || []);
            setProductsNextCursor(result.pagination?.hasNext ? { page: pageValue + 1 } : null);
            setHasMore(Boolean(result.pagination?.hasNext));
            setPage(pageNumber);
        } catch (err) {
            console.error(err);
            setNotice({
                type: 'error',
                text: getErrorMessage(err, 'Failed to load content')
            });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        if (activeTab !== 'tasks') {
            setNotice({ type: 'error', text: 'Use Product Moderation for product status actions.' });
            return;
        }

        try {
            await updateAdminTask(id, { isActive: !currentStatus });
            setItems(items.map(i => i.id === id ? { ...i, isActive: !currentStatus } : i));
        } catch (err) {
            setNotice({ type: 'error', text: getErrorMessage(err, 'Update failed') });
        }
    };

    const handleDelete = async (id: string) => {
        if (activeTab !== 'tasks') {
            setNotice({ type: 'error', text: 'Use Product Moderation for product removal/suspension.' });
            return;
        }
        setArchiveTargetId(id);
    };

    const confirmArchive = async () => {
        if (!archiveTargetId) return;
        setArchiveSubmitting(true);
        try {
            await archiveAdminTask(archiveTargetId, `task_archive_${archiveTargetId}_${Date.now()}`);
            setItems(items.filter(i => i.id !== archiveTargetId));
            setNotice({ type: 'success', text: 'Task archived successfully.' });
            setArchiveTargetId(null);
        } catch (err) {
            setNotice({ type: 'error', text: getErrorMessage(err, 'Delete failed') });
        } finally {
            setArchiveSubmitting(false);
        }
    };

    const handleAdd = async () => {
        if (activeTab === 'products') {
            router.push('/dashboard/admin/products/add');
            return;
        }
        setNewTaskTitle('');
        setShowCreateTaskModal(true);
    };

    const handleCreateTask = async () => {
        const name = newTaskTitle.trim();
        if (!name) {
            setNotice({ type: 'error', text: 'Task title is required.' });
            return;
        }
        setCreateSubmitting(true);
        try {
            await createAdminTask({
                title: name,
                description: 'New Task Description',
                rewardAmount: 100,
                rewardType: 'coins',
                type: 'video',
                isActive: true,
                requestId: `task_cms_${Date.now()}`,
            });
            setShowCreateTaskModal(false);
            setNotice({ type: 'success', text: 'Task created successfully.' });
            const cursor = tasksCursorStack[tasksCursorStack.length - 1] ?? null;
            void fetchItems(cursor, tasksCursorStack.length);
        } catch (err) {
            setNotice({ type: 'error', text: getErrorMessage(err, 'Create failed') });
        } finally {
            setCreateSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Content Management</h1>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
                >
                    <Plus size={18} /> {activeTab === 'products' ? 'Add Product' : 'Add New'}
                </button>
            </div>

            {notice && (
                <div className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    <div className="flex items-center gap-2">
                        {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span className="text-sm font-medium">{notice.text}</span>
                    </div>
                    <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5">
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className="flex gap-4 border-b border-gray-200">
                <button
                    onClick={() => {
                        setActiveTab('tasks');
                        setHasMore(false);
                    }}
                    className={`pb-3 px-4 text-sm font-medium border-b-2 transition ${activeTab === 'tasks' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <span className="flex items-center gap-2"><Film size={16} /> Tasks</span>
                </button>
                <button
                    onClick={() => {
                        setActiveTab('products');
                        setHasMore(false);
                    }}
                    className={`pb-3 px-4 text-sm font-medium border-b-2 transition ${activeTab === 'products' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    <span className="flex items-center gap-2"><ShoppingBag size={16} /> Products</span>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-400">Loading...</div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No items found.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {items.map(item => {
                            const isActive = activeTab === 'tasks' ? !!item.isActive : (item.status === 'approved' || !!item.inStock);
                            return (
                                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                    <div>
                                        <h3 className="font-medium text-gray-900">{item.title || item.name}</h3>
                                        <p className="text-xs text-gray-500">
                                            {activeTab === 'tasks'
                                                ? `Reward: ${item.rewardAmount || item.reward || 0} coins`
                                                : `Price: ₹${item.price}`}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {isActive ? 'Active' : 'Inactive'}
                                        </span>

                                        <button
                                            onClick={() => handleToggleStatus(item.id, isActive)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 transition disabled:opacity-50"
                                            title="Toggle Status"
                                            disabled={activeTab !== 'tasks'}
                                        >
                                            {isActive ? <XCircle size={18} /> : <CheckCircle size={18} />}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 transition disabled:opacity-50"
                                            disabled={activeTab !== 'tasks'}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {(page > 1 || hasMore) && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => {
                            if (page <= 1) return;
                            if (activeTab === 'tasks') {
                                const prevStack = tasksCursorStack.slice(0, -1);
                                const normalized = prevStack.length ? prevStack : [null];
                                const prevCursor = normalized[normalized.length - 1];
                                setTasksCursorStack(normalized);
                                void fetchItems(prevCursor, normalized.length);
                                return;
                            }

                            const prevStack = productsCursorStack.slice(0, -1);
                            const normalized = prevStack.length ? prevStack : [null];
                            const prevCursor = normalized[normalized.length - 1];
                            setProductsCursorStack(normalized);
                            void fetchItems(prevCursor, normalized.length);
                        }}
                        disabled={page <= 1 || loading}
                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-500">Page {page}</span>
                    <button
                        onClick={() => {
                            if (!hasMore) return;
                            if (activeTab === 'tasks') {
                                if (!tasksNextCursor) return;
                                const nextStack = [...tasksCursorStack, tasksNextCursor];
                                setTasksCursorStack(nextStack);
                                void fetchItems(tasksNextCursor, nextStack.length);
                                return;
                            }

                            if (!productsNextCursor) return;
                            const nextStack = [...productsCursorStack, productsNextCursor];
                            setProductsCursorStack(nextStack);
                            void fetchItems(productsNextCursor, nextStack.length);
                        }}
                        disabled={!hasMore || loading}
                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            )}

            {showCreateTaskModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateTaskModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Create New Task</h2>
                        <input
                            type="text"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="Enter task title..."
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mb-4"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCreateTaskModal(false)}
                                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateTask}
                                disabled={createSubmitting}
                                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {createSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {archiveTargetId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setArchiveTargetId(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Archive Task?</h2>
                        <p className="text-sm text-gray-600 mb-4">This task will be archived and removed from this list.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setArchiveTargetId(null)}
                                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmArchive}
                                disabled={archiveSubmitting}
                                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {archiveSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                                Archive
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
