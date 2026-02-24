// File: ThinkMart/components/ads/AdComponents.tsx
import { useState, useEffect } from 'react';

// Simulates a Google Display Ad
export const BannerAd = () => (
  <div className="w-full h-24 bg-gray-100 border border-gray-300 flex flex-col items-center justify-center text-gray-400 my-4 animate-pulse">
    <span className="text-xs font-bold border border-gray-300 px-1 rounded">Ad</span>
    <p className="text-sm">Google Ad Banner Placeholder</p>
  </div>
);

// Simulates a Full Screen Interstitial Ad
export const InterstitialAd = ({ onComplete }: { onComplete: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    if (timeLeft === 0) {
      onComplete();
      return;
    }
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white">
      <div className="absolute top-4 right-4 bg-gray-800 px-4 py-2 rounded-full font-bold">
        Skip in {timeLeft}s
      </div>
      
      <div className="text-center max-w-lg p-8 bg-gray-900 rounded-2xl border border-gray-700">
        <h2 className="text-3xl font-bold mb-4 text-yellow-400">🔥 Exclusive Offer! 🔥</h2>
        <p className="text-gray-300 mb-8">
          This is a full-screen ad simulation. In production, this would be a video or interactive ad from Google AdMob/AdSense.
        </p>
        <div className="w-full bg-blue-600 h-12 rounded-lg flex items-center justify-center font-bold">
          Install App Now
        </div>
      </div>
    </div>
  );
};