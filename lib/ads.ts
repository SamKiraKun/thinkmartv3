export const validateAdTimer = (
  lastWatched: Date | null,
  cooldownMinutes: number = 60
) => {
  if (!lastWatched) return true;

  const now = new Date();
  const diff = now.getTime() - lastWatched.getTime();
  const minutes = diff / (1000 * 60);

  return minutes >= cooldownMinutes;
};

export const getAdReward = (level: number) => {
  const baseReward = 0.1;
  return baseReward * (1 + level * 0.1);
};

export const getNextAdAvailableTime = (
  lastWatched: Date,
  cooldownMinutes: number = 60
) => {
  return new Date(lastWatched.getTime() + cooldownMinutes * 60 * 1000);
};
