export interface Task {
  id: string;
  title: string;
  description: string;
  type: "SURVEY" | "SPIN" | "LUCKY_BOX" | "VIDEO" | "WEBSITE" | "WATCH_VIDEO";
  reward: number;
  rewardType: "COIN" | "CASH";
  frequency?: "DAILY" | "ONCE" | "UNLIMITED";
  minDuration?: number; // Seconds
  cooldownHours?: number;
  maxCompletionsPerDay?: number;
  possibleRewards?: { amount: number, weight: number, label?: string }[]; // For Games
  isActive: boolean;
  createdAt: Date;
  // Survey Specific
  questions?: { text: string; options: string[]; timeLimit: number }[];
}

export interface UserTaskCompletion {
  id: string;
  userId: string;
  taskId: string;
  completedAt: Date;
  reward: number;
}
