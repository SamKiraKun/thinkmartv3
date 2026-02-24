// File: services/settingsService.ts
/**
 * Public Settings Service (API/Turso-backed)
 */

import { apiClient } from '@/lib/api/client';
import type { ApiPublicSettings } from '@/lib/api/types';

const DEFAULT_SETTINGS: ApiPublicSettings = {
    appName: 'ThinkMart',
    maintenanceMode: false,
    signupsEnabled: true,
    withdrawalsEnabled: true,
    membershipFee: 1000,
    minWithdrawalAmount: 500,
};

export async function fetchPublicSettings(): Promise<ApiPublicSettings> {
    try {
        const res = await apiClient.get<{ data: ApiPublicSettings }>('/api/settings/public', { public: true });
        return { ...DEFAULT_SETTINGS, ...res.data };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function subscribeToPublicSettings(
    onData: (settings: ApiPublicSettings) => void,
    onError?: (error: Error) => void
): () => void {
    let cancelled = false;

    void fetchPublicSettings()
        .then((data) => {
            if (!cancelled) onData(data);
        })
        .catch((err) => {
            if (cancelled) return;
            onData(DEFAULT_SETTINGS);
            onError?.(err instanceof Error ? err : new Error(String(err)));
        });

    return () => {
        cancelled = true;
    };
}

