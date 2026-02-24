'use client';

import { useEffect, useState } from 'react';
import { Loader2, Gift, Info, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError } from '@/lib/api/client';
import { fetchGamificationCooldowns, spinWheel } from '@/services/gamificationService';

const PRIZE_ODDS = [
  { label: 'Better Luck Next Time', value: 0, odds: '40%', color: 'bg-gray-200 text-gray-600' },
  { label: '50 Coins', value: 50, odds: '30%', color: 'bg-blue-100 text-blue-700' },
  { label: '100 Coins', value: 100, odds: '20%', color: 'bg-green-100 text-green-700' },
  { label: '500 Coins', value: 500, odds: '8%', color: 'bg-purple-100 text-purple-700' },
  { label: 'JACKPOT (1000)', value: 1000, odds: '2%', color: 'bg-yellow-100 text-yellow-700' },
];

export const SpinWheel = () => {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [pityTriggered, setPityTriggered] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showOdds, setShowOdds] = useState(false);
  const [loadingState, setLoadingState] = useState(true);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.statusCode === 429) return 'Spin is on cooldown. Please wait for the timer.';
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
      const seconds = Number(response.spin?.secondsRemaining || 0);
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

  const handleSpin = async () => {
    if (spinning || cooldownSeconds > 0) return;
    setSpinning(true);
    setResult(null);
    setPityTriggered(false);

    try {
      const response = await spinWheel(`spin-${Date.now()}`);
      const prize = response.prize;
      const wasPity = Boolean(response.pityTriggered);
      const newCooldown = Number(response.cooldown?.secondsRemaining || 0);
      if (Number.isFinite(newCooldown)) {
        setCooldownSeconds(Math.max(0, Math.ceil(newCooldown)));
      }

      const newRotation = rotation + 1800 + Math.random() * 360;
      setRotation(newRotation);

      setTimeout(() => {
        setResult(prize.label);
        setPityTriggered(wasPity);
        setSpinning(false);
      }, 3000);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Spin failed. Please try again.'));
      setSpinning(false);
      void checkCooldown();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-xl border border-gray-200">
      <div className="flex justify-between w-full items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Gift className="text-indigo-600" /> Daily Spin
        </h2>
        <div className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-600">
          {loadingState ? <Loader2 size={14} className="inline animate-spin" /> : cooldownSeconds > 0 ? 'Cooling Down' : 'Ready'}
        </div>
      </div>

      <div
        className="w-64 h-64 rounded-full border-4 border-indigo-600 relative overflow-hidden transition-transform duration-[3000ms] ease-out mb-8 shadow-inner bg-conic-gradient"
        style={{
          transform: `rotate(${rotation}deg)`,
          background: `conic-gradient(
            #ef4444 0deg 72deg,
            #3b82f6 72deg 144deg,
            #10b981 144deg 216deg,
            #f59e0b 216deg 288deg,
            #8b5cf6 288deg 360deg
          )`,
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-gray-300 z-10" />
      </div>

      <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[20px] border-t-gray-800 -mt-10 mb-6 z-20" />

      {result ? (
        <div className="text-center animate-in fade-in zoom-in">
          <p className="text-gray-500">You won:</p>
          <p className="text-3xl font-bold text-indigo-600">{result}</p>
          {result !== 'Better Luck Next Time' && <p className="text-sm text-green-600">Coins added to wallet!</p>}
          {pityTriggered && <p className="text-xs text-amber-600 mt-1">Lucky streak bonus!</p>}
          <button onClick={() => setResult(null)} className="mt-4 text-indigo-600 underline text-sm">
            Spin Again
          </button>
        </div>
      ) : (
        <button
          onClick={handleSpin}
          disabled={spinning || cooldownSeconds > 0}
          className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition disabled:opacity-50 flex flex-col items-center"
        >
          {spinning ? 'Spinning...' : cooldownSeconds > 0 ? `Next spin in ${formatDuration(cooldownSeconds)}` : 'Spin Now'}
        </button>
      )}

      <p className="mt-4 text-xs text-gray-400 flex items-center gap-1">
        <Info size={12} /> Limit: 1 spin every 24 hours
      </p>

      <div className="mt-6 w-full border-t pt-4">
        <button
          onClick={() => setShowOdds(!showOdds)}
          className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-900 transition"
        >
          <span className="font-medium">Prize Odds & Pity System</span>
          {showOdds ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showOdds && (
          <div className="mt-3 space-y-2">
            {PRIZE_ODDS.map((prize, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${prize.color}`}>{prize.label}</span>
                <span className="text-gray-500">{prize.odds}</span>
              </div>
            ))}
            <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
              <strong>Pity System:</strong> If you get &quot;Better Luck Next Time&quot; twice in a row, your 3rd spin is guaranteed to be a win!
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
