"use client";

export const PieChart = () => {
  return (
    <div className="w-full h-64 flex items-center justify-center bg-gray-100 rounded-lg">
      <svg className="w-48 h-48" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="#4f46e5"
          strokeWidth="2"
          stroke="white"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="url(#gradient)"
          strokeWidth="2"
          stroke="white"
          clipPath="polygon(50% 50%, 50% 0%, 100% 0%, 100% 50%)"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
