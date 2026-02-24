// File: ThinkMart/app/dashboard/user/spin/page.tsx
'use client';

import { SpinWheel } from '@/components/tasks/SpinWheel';

export default function SpinPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Daily Lucky Spin 🎰
        </h1>
        <p className="text-gray-500 text-lg">
          Spin the wheel once every 24 hours for a chance to win up to <span className="font-bold text-indigo-600">1,000 Coins</span>!
        </p>
      </div>
      
      <SpinWheel />
      
      <div className="mt-12 bg-indigo-50 border border-indigo-100 rounded-xl p-6 text-center">
        <h3 className="font-bold text-indigo-900 mb-2">How it works</h3>
        <p className="text-sm text-indigo-700">
          Your spin refreshes exactly 24 hours after your last attempt. Prizes are credited to your wallet instantly.
        </p>
      </div>
    </div>
  );
}