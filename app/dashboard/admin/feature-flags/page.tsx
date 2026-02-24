'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Flag,
    Plus,
    Pencil,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Search,
    RefreshCw,
    Users,
    MapPin,
    Percent,
    X,
    Save
} from 'lucide-react';
import {
    createAdminFeatureFlag,
    deleteAdminFeatureFlag,
    fetchAdminFeatureFlags,
    updateAdminFeatureFlag,
    type AdminFeatureFlag as FeatureFlag,
} from '@/services/adminService';

export default function FeatureFlagsPage() {
    const [flags, setFlags] = useState<FeatureFlag[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
    const [deletingFlag, setDeletingFlag] = useState<FeatureFlag | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        enabled: false,
        targetRoles: [] as string[],
        targetCities: [] as string[],
        rolloutPercentage: 100
    });

    const fetchFlags = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchAdminFeatureFlags();
            setFlags(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load feature flags');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFlags();
    }, [fetchFlags]);

    const handleToggle = async (flag: FeatureFlag) => {
        try {
            await updateAdminFeatureFlag(flag.id, {
                requestId: `toggle_${flag.id}_${Date.now()}`,
                enabled: !flag.enabled
            });
            setFlags(flags.map(f => f.id === flag.id ? { ...f, enabled: !f.enabled } : f));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle flag');
        }
    };

    const handleDelete = async (flag: FeatureFlag) => {
        try {
            await deleteAdminFeatureFlag(flag.id, `delete_${flag.id}_${Date.now()}`);
            setFlags(flags.filter(f => f.id !== flag.id));
            setDeletingFlag(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete flag');
        }
    };

    const openCreateModal = () => {
        setEditingFlag(null);
        setFormData({
            name: '',
            description: '',
            enabled: false,
            targetRoles: [],
            targetCities: [],
            rolloutPercentage: 100
        });
        setShowModal(true);
    };

    const openEditModal = (flag: FeatureFlag) => {
        setEditingFlag(flag);
        setFormData({
            name: flag.name,
            description: flag.description || '',
            enabled: flag.enabled,
            targetRoles: flag.targetRoles || [],
            targetCities: flag.targetCities || [],
            rolloutPercentage: flag.rolloutPercentage ?? 100
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            if (editingFlag) {
                await updateAdminFeatureFlag(editingFlag.id, {
                    requestId: `update_${editingFlag.id}_${Date.now()}`,
                    ...formData
                });
            } else {
                await createAdminFeatureFlag({
                    ...formData,
                    requestId: `create_flag_${Date.now()}`
                });
            }
            setShowModal(false);
            fetchFlags();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save flag');
        } finally {
            setSaving(false);
        }
    };

    const filteredFlags = flags.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const AVAILABLE_ROLES = ['user', 'vendor', 'partner', 'organization', 'admin', 'sub_admin'];

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <Flag className="w-7 h-7 text-indigo-600" />
                        Feature Flags
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Control feature rollout and A/B testing
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchFlags}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        <Plus className="w-5 h-5" />
                        New Flag
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}

            {/* Search */}
            <div className="mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search flags..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Flags Grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
            ) : filteredFlags.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <Flag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No feature flags found</p>
                    <button
                        onClick={openCreateModal}
                        className="mt-4 text-indigo-600 hover:underline"
                    >
                        Create your first flag
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredFlags.map((flag) => (
                        <div
                            key={flag.id}
                            className={`bg-white rounded-xl border ${flag.enabled ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
                                } p-5 transition-all hover:shadow-md`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-mono text-sm font-semibold text-gray-900 truncate">
                                        {flag.name}
                                    </h3>
                                    {flag.description && (
                                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                            {flag.description}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleToggle(flag)}
                                    className={`ml-2 p-1 rounded-lg transition-colors ${flag.enabled
                                            ? 'text-green-600 hover:bg-green-100'
                                            : 'text-gray-400 hover:bg-gray-100'
                                        }`}
                                >
                                    {flag.enabled ? (
                                        <ToggleRight className="w-8 h-8" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8" />
                                    )}
                                </button>
                            </div>

                            {/* Targeting Info */}
                            <div className="flex flex-wrap gap-2 mb-4">
                                {flag.targetRoles && flag.targetRoles.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                        <Users className="w-3 h-3" />
                                        {flag.targetRoles.length} roles
                                    </span>
                                )}
                                {flag.targetCities && flag.targetCities.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                                        <MapPin className="w-3 h-3" />
                                        {flag.targetCities.length} cities
                                    </span>
                                )}
                                {flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                                        <Percent className="w-3 h-3" />
                                        {flag.rolloutPercentage}%
                                    </span>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                <span className="text-xs text-gray-400">
                                    {new Date(flag.createdAt).toLocaleDateString()}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(flag)}
                                        className="p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeletingFlag(flag)}
                                        className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-lg font-semibold">
                                {editingFlag ? 'Edit Flag' : 'Create Feature Flag'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Flag Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="new_checkout_flow"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    pattern="^[a-z][a-z0-9_]*$"
                                    title="Lowercase with underscores only"
                                    required
                                    disabled={!!editingFlag}
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Lowercase letters, numbers, and underscores only
                                </p>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="What does this flag control?"
                                    rows={2}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Enabled */}
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">Enabled</label>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                                    className={`p-1 rounded-lg ${formData.enabled ? 'text-green-600' : 'text-gray-400'}`}
                                >
                                    {formData.enabled ? (
                                        <ToggleRight className="w-10 h-10" />
                                    ) : (
                                        <ToggleLeft className="w-10 h-10" />
                                    )}
                                </button>
                            </div>

                            {/* Target Roles */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Target Roles (leave empty for all)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {AVAILABLE_ROLES.map((role) => (
                                        <button
                                            key={role}
                                            type="button"
                                            onClick={() => {
                                                const roles = formData.targetRoles.includes(role)
                                                    ? formData.targetRoles.filter(r => r !== role)
                                                    : [...formData.targetRoles, role];
                                                setFormData({ ...formData, targetRoles: roles });
                                            }}
                                            className={`px-3 py-1 rounded-full text-sm border transition-colors ${formData.targetRoles.includes(role)
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                                                }`}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Rollout Percentage */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Rollout Percentage: {formData.rolloutPercentage}%
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={formData.rolloutPercentage}
                                    onChange={(e) => setFormData({ ...formData, rolloutPercentage: parseInt(e.target.value) })}
                                    className="w-full accent-indigo-600"
                                />
                            </div>

                            {/* Submit */}
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Saving...' : editingFlag ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingFlag && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Feature Flag?</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            This will permanently delete <span className="font-mono font-semibold">{deletingFlag.name}</span>.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeletingFlag(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(deletingFlag)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
