'use client';

import { useEffect, useState } from 'react';
import { PackageOpen, Sparkles, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError } from '@/lib/api/client';
import { fetchGamificationCooldowns, openLuckyBox } from '@/services/gamificationService';

export const LuckyBox = () => {
  const [opening, setOpening] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [loadingState, setLoadingState] = useState(true);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.statusCode === 429) return 'Lucky Box is on cooldown. Please wait for the timer.';
      if (error.statusCode === 401) return 'Session expired. Please sign in again.';
      return error.message || fallback;
    }
    return error instanceof Error ? error.message : fallback;
  };

  const formatDuration = (seconds: number) => {
    const safe = Math.max(0, seconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${secs
      .toString()
      .padStart(2, '0')}s`;
  };

  const checkCooldown = async () => {
    try {
      const response = await fetchGamificationCooldowns();
      const seconds = Number(response.luckyBox?.secondsRemaining || 0);
      setCooldownSeconds(Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingState(false);
    }
  };

  useEffect(() => {
    void checkCooldown();
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const openBox = async () => {
    if (opening || cooldownSeconds > 0) return;
    setOpening(true);
    try {
      const res = await openLuckyBox(`lucky-box-${Date.now()}`);
      const newCooldown = Number(res.cooldown?.secondsRemaining || 0);
      if (Number.isFinite(newCooldown)) {
        setCooldownSeconds(Math.max(0, Math.ceil(newCooldown)));
      }

      setTimeout(() => {
        setReward(Number(res.reward || 0));
        setOpening(false);
      }, 2000);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to open box. Please try again.'));
      setOpening(false);
      void checkCooldown();
    }
  };

  const canOpen = cooldownSeconds <= 0;

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-b from-indigo-900 to-purple-900 rounded-2xl shadow-2xl text-white relative overflow-hidden">
      <div className="absolute top-4 right-4 bg-white/10 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm border border-white/20">
        {loadingState ? '...' : canOpen ? 'Ready' : 'Cooling'}
      </div>

      <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
        <Sparkles className="text-yellow-400" /> Lucky Box
      </h2>

      {reward ? (
        <div className="text-center animate-in fade-in zoom-in py-10">
          <div className="text-6xl mb-4">💰</div>
          <h3 className="text-4xl font-bold text-yellow-400">+{reward}</h3>
          <p className="text-indigo-200 mb-6">Coins Added!</p>
          <button
            onClick={() => setReward(null)}
            className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition"
          >
            Open Another
          </button>
        </div>
      ) : (
        <div className="py-4">
          <div
            onClick={canOpen ? openBox : undefined}
            className={`cursor-pointer transition-transform duration-500 ${
              opening ? 'scale-110 animate-pulse' : canOpen ? 'hover:scale-105' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <PackageOpen size={120} className={opening ? 'text-yellow-200' : 'text-yellow-400'} />
          </div>
        </div>
      )}

      <div className="mt-8 text-center h-8">
        {opening ? (
          <p className="text-indigo-300 text-sm animate-pulse">Unlocking mystery...</p>
        ) : !canOpen ? (
          <p className="text-orange-300 text-sm flex items-center justify-center gap-2 font-medium">
            <Clock size={14} /> Next open in {formatDuration(cooldownSeconds)}
          </p>
        ) : (
          <p className="text-indigo-300 text-sm">Tap to open</p>
        )}
      </div>
    </div>
  );
};
