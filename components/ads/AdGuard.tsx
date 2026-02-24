// File: ThinkMart/components/ads/AdGuard.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, PlayCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AdGuardProps {
  onAdComplete: () => void;
  timerSeconds?: number;
  children: React.ReactNode; // The "Claim Reward" button usually
  active?: boolean; // If false, bypasses ad (for testing or premium users?)
}

export function AdGuard({ onAdComplete, timerSeconds = 15, children, active = true }: AdGuardProps) {
  const [adState, setAdState] = useState<'IDLE' | 'PLAYING' | 'COMPLETED'>('IDLE');
  const [timeLeft, setTimeLeft] = useState(timerSeconds);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (adState === 'PLAYING' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (adState === 'PLAYING' && timeLeft === 0) {
      setAdState('COMPLETED');
      onAdComplete();
    }

    return () => clearInterval(interval);
  }, [adState, timeLeft, onAdComplete]);

  const startAd = () => {
    setAdState('PLAYING');
    setTimeLeft(timerSeconds);
  };

  if (!active) return <>{children}</>;

  if (adState === 'COMPLETED') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-green-600 text-sm font-medium bg-green-50 p-2 rounded justify-center">
          <CheckCircle size={16} /> Ad Watched Successfully
        </div>
        {children}
      </div>
    );
  }

  if (adState === 'PLAYING') {
    return (
      <div className="bg-gray-900 text-white rounded-lg p-6 text-center space-y-4 shadow-inner">
        <p className="text-sm text-gray-300 uppercase tracking-widest font-bold">Advertisement</p>
        <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
            style={{ width: `${((timerSeconds - timeLeft) / timerSeconds) * 100}%` }}
          />
        </div>
        <p className="text-2xl font-mono">{timeLeft}s remaining</p>
        <p className="text-xs text-gray-400">Please do not close this window.</p>
      </div>
    );
  }

  return (
    <Button onClick={startAd} className="w-full bg-indigo-600 hover:bg-indigo-700">
      <PlayCircle className="mr-2" size={18} />
      Watch Ad to Unlock Reward
    </Button>
  );
}