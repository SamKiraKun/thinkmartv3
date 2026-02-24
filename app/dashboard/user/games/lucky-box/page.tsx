'use client';

import { LuckyBox } from '@/components/tasks/LuckyBox';

export default function LegacyLuckyBoxRoutePage() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Daily Mystery Reward</h1>
        <p className="text-gray-500 text-lg">
          This legacy route now uses the same server-enforced cooldown as the main Lucky Box page.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-md">
          <LuckyBox />
        </div>
      </div>
    </div>
  );
}
