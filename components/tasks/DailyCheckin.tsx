'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, Gift, Flame, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api/client';
import {
  claimDailyCheckin,
  fetchDailyCheckinStatus,
  fetchGamificationCooldowns,
} from '@/services/gamificationService';

export const DailyCheckin = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [reward, setReward] = useState(0);
  const [notice, setNotice] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.statusCode === 429) return 'Task reward is on cooldown. Please wait for the timer.';
      if (error.statusCode === 401) return 'Your session expired. Please sign in again.';
      if (error.statusCode === 400) return error.message || 'Invalid request. Please refresh and try again.';
      return error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
  };

  useEffect(() => {
    const checkStatus = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const [status, cooldowns] = await Promise.all([
          fetchDailyCheckinStatus(),
          fetchGamificationCooldowns(),
        ]);
        setStreak(Number(status.streak || 0));
        setClaimed(Boolean(status.claimedToday));
        setReward(Number(status.lastReward || 0));
        const seconds = Number(cooldowns.tasks?.secondsRemaining || status.cooldown?.secondsRemaining || 0);
        const normalized = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
        setCooldownSeconds(normalized);
        if (normalized > 0) setClaimed(true);
      } catch (err) {
        console.error('Failed to check status:', err);
      } finally {
        setLoading(false);
      }
    };

    void checkStatus();
  }, [user]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const formatDuration = (seconds: number) => {
    const safe = Math.max(0, seconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${secs
      .toString()
      .padStart(2, '0')}s`;
  };

  const handleCheckin = async () => {
    if (claiming || claimed) return;
    if (!user) {
      setNotice('Please sign in again to continue.');
      return;
    }

    setNotice('');
    setClaiming(true);
    try {
      const result = await claimDailyCheckin(`daily-checkin-${Date.now()}`);
      setReward(Number(result.reward || 0));
      setStreak(Number(result.streak || 0));
      setClaimed(true);
      const seconds = Number(result.cooldown?.secondsRemaining || 0);
      if (Number.isFinite(seconds)) {
        setCooldownSeconds(Math.max(0, Math.ceil(seconds)));
      }
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 400 || err.statusCode === 429)) {
        setClaimed(true);
        try {
          const cooldowns = await fetchGamificationCooldowns();
          const seconds = Number(cooldowns.tasks?.secondsRemaining || 0);
          if (Number.isFinite(seconds)) setCooldownSeconds(Math.max(0, Math.ceil(seconds)));
        } catch {}
      }
      setNotice(getErrorMessage(err, 'Check-in failed'));
    } finally {
      setClaiming(false);
    }
  };

  const BASE_REWARD = 100;
  const STREAK_BONUS = 20;
  const nextReward = BASE_REWARD + STREAK_BONUS * Math.min(streak, 6);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white flex items-center justify-center h-48">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        {notice && (
          <div className="mb-4 p-3 rounded-lg border bg-red-50 border-red-200 text-red-700 text-sm font-medium">
            {notice}
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <CalendarCheck size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Daily Check-in</h3>
              <p className="text-amber-100 text-sm">Claim your daily reward!</p>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
            <Flame className="text-yellow-300" size={18} />
            <span className="font-bold">{streak} Day{streak !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm">Today&apos;s Reward</p>
              <p className="text-3xl font-bold flex items-center gap-2">
                <Gift size={24} />
                {claimed ? reward || nextReward : nextReward} Coins
              </p>
            </div>
            {streak > 0 && !claimed && (
              <div className="text-right">
                <p className="text-amber-200 text-xs">Streak Bonus</p>
                <p className="font-bold">+{STREAK_BONUS * Math.min(streak, 6)}</p>
              </div>
            )}
          </div>
        </div>

        <Button
          onClick={handleCheckin}
          disabled={claimed || claiming}
          className={`w-full h-14 text-lg font-bold transition-all ${
            claimed ? 'bg-green-600 text-white cursor-default' : 'bg-white text-orange-600 hover:bg-amber-50'
          }`}
        >
          {claiming ? (
            <>
              <Loader2 className="animate-spin mr-2" /> Claiming...
            </>
          ) : claimed ? (
            <>
              <CheckCircle className="mr-2" /> Claimed!
            </>
          ) : (
            <>Claim Today&apos;s Reward</>
          )}
        </Button>

        <p className="text-center text-amber-100 text-xs mt-3">
          {claimed
            ? cooldownSeconds > 0
              ? `Next check-in in ${formatDuration(cooldownSeconds)}`
              : 'Come back tomorrow to continue your streak!'
            : 'Check in daily to increase your streak bonus!'}
        </p>
      </div>
    </div>
  );
};
