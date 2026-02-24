"use client";

export const LineChart = () => {
  return (
    <div className="w-full h-64 flex items-center justify-center bg-gray-100 rounded-lg">
      <svg className="w-full h-full" viewBox="0 0 400 200">
        <polyline
          points="0,150 50,120 100,100 150,80 200,90 250,70 300,85 350,60 400,40"
          stroke="#4f46e5"
          fill="none"
          strokeWidth="2"
        />
        <polyline
          points="0,150 50,120 100,100 150,80 200,90 250,70 300,85 350,60 400,40"
          stroke="#4f46e5"
          fill="#4f46e520"
        />
      </svg>
    </div>
  );
};
