"use client";

import { useState } from "react";

interface SurveyCardProps {
  title: string;
  reward: number;
  estimatedTime: string;
}

export const SurveyCard: React.FC<SurveyCardProps> = ({
  title,
  reward,
  estimatedTime,
}) => {
  const [completed, setCompleted] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-4">
        Time: {estimatedTime} | Reward: ₹{reward}
      </p>
      <button
        onClick={() => setCompleted(!completed)}
        disabled={completed}
        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {completed ? "Completed" : "Start Survey"}
      </button>
    </div>
  );
};
