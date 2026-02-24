'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAdminGameConfigs, updateAdminGameConfig, type AdminGameConfig, type AdminGamePrize } from '@/services/adminService';
import {
    Loader2, Save, RefreshCw, Gamepad2, Gift, RotateCcw,
    AlertTriangle, CheckCircle, Plus, Trash2, Palette
} from 'lucide-react';

type Prize = AdminGamePrize;
type GameConfig = AdminGameConfig;

type PrizeFieldValue = string | number;

const DEFAULT_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

export default function AdminGamesPage() {
    const [configs, setConfigs] = useState<GameConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [editingConfig, setEditingConfig] = useState<GameConfig | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const fetchConfigs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchAdminGameConfigs();
            setConfigs(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load game configs');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    const handleSave = async (config: GameConfig) => {
        setSaving(config.id);
        setError(null);
        setSuccess(null);

        try {
            await updateAdminGameConfig(config);

            setSuccess(`${config.name} updated successfully!`);
            setEditingConfig(null);
            setHasChanges(false);
            await fetchConfigs();

            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Failed to save config');
        } finally {
            setSaving(null);
        }
    };

    const validateProbabilities = (prizes: Prize[]): string | null => {
        const total = prizes.reduce((sum, p) => sum + p.probability, 0);
        if (Math.abs(total - 100) > 0.01) {
            return `Prize probabilities must sum to 100%. Current total: ${total.toFixed(1)}%`;
        }
        return null;
    };

    const updateEditingPrize = (index: number, field: keyof Prize, value: PrizeFieldValue) => {
        if (!editingConfig) return;
        const newPrizes = [...editingConfig.prizes];
        newPrizes[index] = { ...newPrizes[index], [field]: value };
        setEditingConfig({ ...editingConfig, prizes: newPrizes });
        setHasChanges(true);
    };

    const addPrize = () => {
        if (!editingConfig) return;
        const newPrize: Prize = {
            id: `prize_${Date.now()}`,
            label: 'New Prize',
            value: 0,
            probability: 0,
            color: DEFAULT_COLORS[editingConfig.prizes.length % DEFAULT_COLORS.length],
        };
        setEditingConfig({ ...editingConfig, prizes: [...editingConfig.prizes, newPrize] });
        setHasChanges(true);
    };

    const removePrize = (index: number) => {
        if (!editingConfig || editingConfig.prizes.length <= 2) return;
        const newPrizes = editingConfig.prizes.filter((_, i) => i !== index);
        setEditingConfig({ ...editingConfig, prizes: newPrizes });
        setHasChanges(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="ml-3 text-gray-600">Loading game configurations...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Gamepad2 className="w-8 h-8 text-purple-600" />
                    <h1 className="text-3xl font-bold text-gray-900">Game Configuration</h1>
                </div>
                <button
                    onClick={fetchConfigs}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <span className="text-red-700">{error}</span>
                </div>
            )}

            {success && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <span className="text-green-700">{success}</span>
                </div>
            )}

            {/* Game Config Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {configs.length === 0 ? (
                    <div className="col-span-2 p-12 bg-white rounded-xl border border-gray-200 text-center">
                        <Gamepad2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No game configurations found.</p>
                        <p className="text-sm text-gray-400 mt-2">
                            Create spin_wheel and lucky_box documents in the game_configs collection.
                        </p>
                    </div>
                ) : (
                    configs.map((config) => (
                        <GameConfigCard
                            key={config.id}
                            config={config}
                            isEditing={editingConfig?.id === config.id}
                            editingConfig={editingConfig?.id === config.id ? editingConfig : null}
                            saving={saving === config.id}
                            onEdit={() => {
                                setEditingConfig({ ...config });
                                setHasChanges(false);
                            }}
                            onCancel={() => {
                                setEditingConfig(null);
                                setHasChanges(false);
                            }}
                            onSave={() => editingConfig && handleSave(editingConfig)}
                            onToggleEnabled={(enabled) => {
                                if (editingConfig?.id === config.id) {
                                    setEditingConfig({ ...editingConfig, enabled });
                                    setHasChanges(true);
                                }
                            }}
                            onUpdateLimit={(dailyLimit) => {
                                if (editingConfig?.id === config.id) {
                                    setEditingConfig({ ...editingConfig, dailyLimit });
                                    setHasChanges(true);
                                }
                            }}
                            onUpdateCooldown={(cooldownMinutes) => {
                                if (editingConfig?.id === config.id) {
                                    setEditingConfig({ ...editingConfig, cooldownMinutes });
                                    setHasChanges(true);
                                }
                            }}
                            onUpdatePrize={updateEditingPrize}
                            onAddPrize={addPrize}
                            onRemovePrize={removePrize}
                            hasChanges={hasChanges}
                            validationError={editingConfig?.id === config.id ? validateProbabilities(editingConfig.prizes) : null}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// Game Config Card Component
function GameConfigCard({
    config,
    isEditing,
    editingConfig,
    saving,
    onEdit,
    onCancel,
    onSave,
    onToggleEnabled,
    onUpdateLimit,
    onUpdateCooldown,
    onUpdatePrize,
    onAddPrize,
    onRemovePrize,
    hasChanges,
    validationError,
}: {
    config: GameConfig;
    isEditing: boolean;
    editingConfig: GameConfig | null;
    saving: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    onToggleEnabled: (enabled: boolean) => void;
    onUpdateLimit: (limit: number) => void;
    onUpdateCooldown: (cooldown: number) => void;
    onUpdatePrize: (index: number, field: keyof Prize, value: PrizeFieldValue) => void;
    onAddPrize: () => void;
    onRemovePrize: (index: number) => void;
    hasChanges: boolean;
    validationError: string | null;
}) {
    const displayConfig = isEditing && editingConfig ? editingConfig : config;
    const isSpinWheel = config.type === 'spin_wheel';

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className={`p-4 ${isSpinWheel ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isSpinWheel ? (
                            <RotateCcw className="w-6 h-6 text-white" />
                        ) : (
                            <Gift className="w-6 h-6 text-white" />
                        )}
                        <h2 className="text-xl font-bold text-white">{config.name}</h2>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${displayConfig.enabled ? 'bg-white/20 text-white' : 'bg-black/20 text-white/70'}`}>
                        {displayConfig.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {/* Settings Row */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                        <button
                            onClick={() => isEditing && onToggleEnabled(!displayConfig.enabled)}
                            disabled={!isEditing}
                            className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition
                ${displayConfig.enabled
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-500'
                                }
                ${isEditing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
              `}
                        >
                            {displayConfig.enabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Daily Limit</label>
                        <input
                            type="number"
                            value={displayConfig.dailyLimit}
                            onChange={(e) => onUpdateLimit(parseInt(e.target.value) || 0)}
                            disabled={!isEditing}
                            className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Cooldown (min)</label>
                        <input
                            type="number"
                            value={displayConfig.cooldownMinutes}
                            onChange={(e) => onUpdateCooldown(parseInt(e.target.value) || 0)}
                            disabled={!isEditing}
                            className="w-full py-2 px-3 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
                        />
                    </div>
                </div>

                {/* Prizes Table */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700">Prize Configuration</label>
                        {isEditing && (
                            <button
                                onClick={onAddPrize}
                                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Add Prize
                            </button>
                        )}
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    {isSpinWheel && <th className="px-3 py-2 text-left text-gray-600 w-10">Color</th>}
                                    <th className="px-3 py-2 text-left text-gray-600">Label</th>
                                    <th className="px-3 py-2 text-right text-gray-600 w-20">Value</th>
                                    <th className="px-3 py-2 text-right text-gray-600 w-20">Prob %</th>
                                    {isEditing && <th className="px-3 py-2 w-8"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {displayConfig.prizes.map((prize, index) => (
                                    <tr key={prize.id} className="hover:bg-gray-50">
                                        {isSpinWheel && (
                                            <td className="px-3 py-2">
                                                {isEditing ? (
                                                    <input
                                                        type="color"
                                                        value={prize.color || '#3b82f6'}
                                                        onChange={(e) => onUpdatePrize(index, 'color', e.target.value)}
                                                        className="w-8 h-6 cursor-pointer rounded border-0"
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-6 h-6 rounded"
                                                        style={{ backgroundColor: prize.color || '#3b82f6' }}
                                                    />
                                                )}
                                            </td>
                                        )}
                                        <td className="px-3 py-2">
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={prize.label}
                                                    onChange={(e) => onUpdatePrize(index, 'label', e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                                                />
                                            ) : (
                                                <span className="text-gray-900">{prize.label}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={prize.value}
                                                    onChange={(e) => onUpdatePrize(index, 'value', parseInt(e.target.value) || 0)}
                                                    className="w-full px-2 py-1 border border-gray-200 rounded text-sm text-right"
                                                />
                                            ) : (
                                                <span className="font-medium text-amber-600">{prize.value}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={prize.probability}
                                                    onChange={(e) => onUpdatePrize(index, 'probability', parseFloat(e.target.value) || 0)}
                                                    className="w-full px-2 py-1 border border-gray-200 rounded text-sm text-right"
                                                    step="0.1"
                                                />
                                            ) : (
                                                <span className="text-gray-600">{prize.probability}%</span>
                                            )}
                                        </td>
                                        {isEditing && (
                                            <td className="px-2 py-2">
                                                <button
                                                    onClick={() => onRemovePrize(index)}
                                                    disabled={displayConfig.prizes.length <= 2}
                                                    className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Probability Total */}
                    <div className="mt-2 flex justify-between text-sm">
                        <span className="text-gray-500">Total Probability:</span>
                        <span className={`font-medium ${validationError ? 'text-red-600' : 'text-green-600'}`}>
                            {displayConfig.prizes.reduce((sum, p) => sum + p.probability, 0).toFixed(1)}%
                        </span>
                    </div>
                    {validationError && (
                        <p className="mt-1 text-xs text-red-600">{validationError}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    {isEditing ? (
                        <>
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onSave}
                                disabled={saving || !hasChanges || !!validationError}
                                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition
                  ${hasChanges && !validationError
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onEdit}
                            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition"
                        >
                            Edit Configuration
                        </button>
                    )}
                </div>

                {/* Last Updated */}
                {config.updatedAt && (
                    <p className="text-xs text-gray-400 text-right">
                        Last updated: {new Date(config.updatedAt).toLocaleString()}
                    </p>
                )}
            </div>
        </div>
    );
}
