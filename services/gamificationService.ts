import { apiClient } from '@/lib/api/client';

export interface GamificationCooldowns {
  tasks?: { secondsRemaining?: number };
  spin?: { secondsRemaining?: number };
  luckyBox?: { secondsRemaining?: number };
}

export interface DailyCheckinStatus {
  streak: number;
  claimedToday: boolean;
  lastReward: number;
  nextReward: number;
  cooldown?: { secondsRemaining?: number };
}

export interface DailyCheckinResult {
  reward: number;
  streak: number;
  cooldown?: { secondsRemaining?: number };
}

export interface SpinWheelResult {
  prize: { label: string; value: number; odds: string; color?: string };
  pityTriggered?: boolean;
  cooldown?: { secondsRemaining?: number };
}

export interface LuckyBoxResult {
  reward: number;
  cooldown?: { secondsRemaining?: number };
}

export async function fetchGamificationCooldowns(): Promise<GamificationCooldowns> {
  const res = await apiClient.get<{ data: GamificationCooldowns }>('/api/gamification/cooldowns');
  return res.data || {};
}

export async function fetchDailyCheckinStatus(): Promise<DailyCheckinStatus> {
  const res = await apiClient.get<{ data: DailyCheckinStatus }>('/api/gamification/daily-checkin/status');
  return res.data;
}

export async function claimDailyCheckin(requestId?: string): Promise<DailyCheckinResult> {
  const res = await apiClient.post<{ data: DailyCheckinResult }>(
    '/api/gamification/daily-checkin',
    {},
    requestId ? { idempotencyKey: requestId } : undefined
  );
  return res.data;
}

export async function spinWheel(requestId?: string): Promise<SpinWheelResult> {
  const res = await apiClient.post<{ data: SpinWheelResult }>(
    '/api/gamification/spin-wheel',
    {},
    requestId ? { idempotencyKey: requestId } : undefined
  );
  return res.data;
}

export async function openLuckyBox(requestId?: string): Promise<LuckyBoxResult> {
  const res = await apiClient.post<{ data: LuckyBoxResult }>(
    '/api/gamification/lucky-box',
    {},
    requestId ? { idempotencyKey: requestId } : undefined
  );
  return res.data;
}
