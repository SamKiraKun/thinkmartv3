// File: ThinkMart/app/dashboard/user/lucky-box/page.tsx
'use client';

import { LuckyBox } from '@/components/tasks/LuckyBox';

export default function LuckyBoxPage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Daily Mystery Reward
        </h1>
        <p className="text-gray-500 text-lg">
          A special gift for our loyal members. Open your Lucky Box once every <span className="font-bold text-indigo-600">24 hours</span>.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-md">
          <LuckyBox />
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="text-2xl mb-1">100</div>
          <div className="font-bold text-gray-700">100 Coins</div>
          <div className="text-xs text-gray-500">Common</div>
        </div>
        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="text-2xl mb-1">500</div>
          <div className="font-bold text-gray-700">500 Coins</div>
          <div className="text-xs text-gray-500">Rare</div>
        </div>
        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 bg-yellow-50 border-yellow-200">
          <div className="text-2xl mb-1">1000</div>
          <div className="font-bold text-yellow-700">1000 Coins</div>
          <div className="text-xs text-yellow-600 font-bold">Legendary</div>
        </div>
      </div>
    </div>
  );
}
