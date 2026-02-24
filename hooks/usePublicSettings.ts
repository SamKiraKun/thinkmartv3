'use client';

import { useEffect, useState } from 'react';
import { fetchPublicSettings } from '@/services/settingsService';

export interface PublicSettings {
  maintenanceMode?: boolean;
  signupsEnabled?: boolean;
  withdrawalsEnabled?: boolean;
  appName?: string;
  membershipFee?: number;
  minWithdrawalAmount?: number;
}

export function usePublicSettings() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchPublicSettings();
        if (!cancelled) {
          setSettings(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load public settings:', err);
          setError('Failed to load platform settings');
          setSettings({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading, error };
}
