'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAdminSettings, updateAdminSettings, type AdminSettings } from '@/services/adminService';
import {
  Loader2, Save, RefreshCw, Settings, Wallet, Users, Gamepad2,
  AlertTriangle, CheckCircle, Power, PowerOff
} from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<AdminSettings | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
      setOriginalSettings(data);
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!settings || !hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateAdminSettings(settings);

      setSuccess('Settings saved successfully!');
      setOriginalSettings(settings);
      setHasChanges(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading settings...</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 bg-red-50 rounded-lg border border-red-200">
        <p className="text-red-600">{error || 'Failed to load settings'}</p>
        <button onClick={fetchSettings} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">Platform Settings</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSettings}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition
              ${hasChanges
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Economy Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Withdrawal Settings</h2>
          </div>
          <div className="space-y-4">
            <SettingInput
              label="Minimum Withdrawal (₹)"
              value={settings.minWithdrawalAmount}
              onChange={(v) => updateSetting('minWithdrawalAmount', v)}
              min={0}
            />
            <SettingInput
              label="Maximum Withdrawal (₹)"
              value={settings.maxWithdrawalAmount}
              onChange={(v) => updateSetting('maxWithdrawalAmount', v)}
              min={0}
            />
            <SettingInput
              label="Daily Withdrawal Limit (₹)"
              value={settings.dailyWithdrawalLimit}
              onChange={(v) => updateSetting('dailyWithdrawalLimit', v)}
              min={0}
            />
            <SettingInput
              label="Withdrawal Fee (%)"
              value={settings.withdrawalFeePercent}
              onChange={(v) => updateSetting('withdrawalFeePercent', v)}
              min={0}
              max={100}
            />
          </div>
        </div>

        {/* Commission Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Commission Settings</h2>
          </div>
          <div className="space-y-4">
            <SettingInput
              label="Referral Bonus (₹)"
              value={settings.referralBonusAmount}
              onChange={(v) => updateSetting('referralBonusAmount', v)}
              min={0}
            />
            <SettingInput
              label="Referral Commission (%)"
              value={settings.referralCommissionPercent}
              onChange={(v) => updateSetting('referralCommissionPercent', v)}
              min={0}
              max={100}
            />
            <SettingInput
              label="Organization Commission (%)"
              value={settings.orgCommissionPercent}
              onChange={(v) => updateSetting('orgCommissionPercent', v)}
              min={0}
              max={100}
            />
            <SettingInput
              label="Partner Commission (%)"
              value={settings.partnerCommissionPercent}
              onChange={(v) => updateSetting('partnerCommissionPercent', v)}
              min={0}
              max={50}
              hint="Maximum 50%"
            />
          </div>
        </div>

        {/* Task & Game Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Gamepad2 className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Task & Game Limits</h2>
          </div>
          <div className="space-y-4">
            <SettingInput
              label="Daily Task Limit"
              value={settings.dailyTaskLimit}
              onChange={(v) => updateSetting('dailyTaskLimit', v)}
              min={0}
            />
            <SettingInput
              label="Task Cooldown (minutes)"
              value={settings.taskCooldownMinutes}
              onChange={(v) => updateSetting('taskCooldownMinutes', v)}
              min={0}
            />
            <SettingInput
              label="Daily Spin Limit"
              value={settings.dailySpinLimit}
              onChange={(v) => updateSetting('dailySpinLimit', v)}
              min={0}
            />
            <SettingInput
              label="Daily Lucky Box Limit"
              value={settings.dailyLuckyBoxLimit}
              onChange={(v) => updateSetting('dailyLuckyBoxLimit', v)}
              min={0}
            />
          </div>
        </div>

        {/* Platform Toggles */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Power className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-gray-900">Platform Controls</h2>
          </div>
          <div className="space-y-4">
            <ToggleSetting
              label="Maintenance Mode"
              description="When enabled, users will see a maintenance page"
              enabled={settings.maintenanceMode}
              onChange={(v) => updateSetting('maintenanceMode', v)}
              danger
            />
            <ToggleSetting
              label="Signups Enabled"
              description="Allow new user registrations"
              enabled={settings.signupsEnabled}
              onChange={(v) => updateSetting('signupsEnabled', v)}
            />
            <ToggleSetting
              label="Withdrawals Enabled"
              description="Allow users to request withdrawals"
              enabled={settings.withdrawalsEnabled}
              onChange={(v) => updateSetting('withdrawalsEnabled', v)}
            />
          </div>

          {/* Last Updated Info */}
          {settings.updatedAt && (
            <div className="mt-6 pt-4 border-t border-gray-100 text-sm text-gray-500">
              Last updated: {new Date(settings.updatedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function SettingInput({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  enabled,
  onChange,
  danger,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${enabled
            ? danger ? 'bg-red-600' : 'bg-indigo-600'
            : 'bg-gray-300'
          }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}
