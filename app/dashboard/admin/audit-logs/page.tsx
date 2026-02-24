'use client';

import { useState, useEffect } from 'react';
import {
    FileText,
    Search,
    RefreshCw,
    Filter,
    Calendar,
    User,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Activity,
    Clock
} from 'lucide-react';
import {
    fetchAdminAuditActionTypes,
    fetchAdminAuditLogs,
    fetchAdminAuditLogStats,
    type AdminAuditLogEntry as AuditLogEntry,
    type AdminAuditLogStats as AuditStats,
} from '@/services/adminService';

export default function AuditLogsPage() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [actionTypes, setActionTypes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [expandedLog, setExpandedLog] = useState<string | null>(null);

    // Filters
    const [filters, setFilters] = useState({
        action: '',
        targetType: '',
        fromDate: '',
        toDate: ''
    });

    const fetchLogs = async (pageNum = 1) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchAdminAuditLogs(pageNum, 50, {
                action: filters.action || undefined,
                targetType: filters.targetType || undefined,
                fromDate: filters.fromDate ? new Date(filters.fromDate).toISOString() : undefined,
                toDate: filters.toDate ? new Date(filters.toDate).toISOString() : undefined,
            });
            setLogs(result.data || []);
            setTotal(result.pagination?.total || 0);
            setHasMore(Boolean(result.pagination?.hasNext));
            setPage(pageNum);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const result = await fetchAdminAuditLogStats();
            setStats(result);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    const fetchActionTypes = async () => {
        try {
            const actions = await fetchAdminAuditActionTypes();
            setActionTypes(actions);
        } catch (err) {
            console.error('Failed to fetch action types:', err);
        }
    };

    useEffect(() => {
        fetchLogs();
        fetchStats();
        fetchActionTypes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyFilters = () => {
        fetchLogs(1);
        setShowFilters(false);
    };

    const clearFilters = () => {
        setFilters({ action: '', targetType: '', fromDate: '', toDate: '' });
        fetchLogs(1);
    };

    const getActionColor = (action: string) => {
        if (action.includes('APPROVED') || action.includes('VERIFIED') || action.includes('CREATED')) {
            return 'bg-green-100 text-green-700';
        }
        if (action.includes('REJECTED') || action.includes('BANNED') || action.includes('SUSPENDED') || action.includes('DELETED')) {
            return 'bg-red-100 text-red-700';
        }
        if (action.includes('UPDATED') || action.includes('ADJUSTED')) {
            return 'bg-blue-100 text-blue-700';
        }
        return 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <FileText className="w-7 h-7 text-indigo-600" />
                        Audit Logs
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Track all administrative actions
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </button>
                    <button
                        onClick={() => fetchLogs(page)}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <FileText className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Logs</p>
                                <p className="text-xl font-bold text-gray-900">{stats.totalLogs.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <Clock className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Today</p>
                                <p className="text-xl font-bold text-gray-900">{stats.logsToday}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Activity className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Top Action</p>
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                    {stats.topActions[0]?.action || 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <User className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Most Active</p>
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                    {stats.topActors[0]?.actorName || stats.topActors[0]?.actorId?.slice(0, 8) || 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters Panel */}
            {showFilters && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                            <select
                                value={filters.action}
                                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">All Actions</option>
                                {actionTypes.map(action => (
                                    <option key={action} value={action}>{action}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Target Type</label>
                            <select
                                value={filters.targetType}
                                onChange={(e) => setFilters({ ...filters, targetType: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">All Types</option>
                                <option value="user">User</option>
                                <option value="kyc">KYC</option>
                                <option value="withdrawal">Withdrawal</option>
                                <option value="order">Order</option>
                                <option value="product">Product</option>
                                <option value="partner">Partner</option>
                                <option value="settings">Settings</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                            <input
                                type="date"
                                value={filters.fromDate}
                                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                            <input
                                type="date"
                                value={filters.toDate}
                                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            onClick={clearFilters}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            Clear
                        </button>
                        <button
                            onClick={applyFilters}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}

            {/* Logs Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No audit logs found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Time</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actor</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Target</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900">
                                            {log.actorName || log.actorId.slice(0, 12)}...
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs text-gray-500 uppercase">{log.targetType}</span>
                                            <p className="text-sm text-gray-900 font-mono">{log.targetId.slice(0, 12)}...</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                <button
                                                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                                    className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                                                >
                                                    {expandedLog === log.id ? 'Hide' : 'View'}
                                                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedLog === log.id ? 'rotate-180' : ''}`} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {!loading && logs.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                        <p className="text-sm text-gray-500">
                            Showing {((page - 1) * 50) + 1} - {Math.min(page * 50, total)} of {total.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fetchLogs(page - 1)}
                                disabled={page === 1}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-3 py-1 text-sm font-medium">Page {page}</span>
                            <button
                                onClick={() => fetchLogs(page + 1)}
                                disabled={!hasMore}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Expanded Details */}
            {expandedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setExpandedLog(null)}>
                    <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="font-semibold">Log Details</h3>
                            <button onClick={() => setExpandedLog(null)} className="text-gray-400 hover:text-gray-600">×</button>
                        </div>
                        <pre className="p-4 text-sm overflow-auto bg-gray-50">
                            {JSON.stringify(logs.find(l => l.id === expandedLog)?.metadata || {}, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}
