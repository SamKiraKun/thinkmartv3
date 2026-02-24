export const canCompleteTask = (
  lastCompleted: Date | null,
  cooldownHours: number
) => {
  if (!lastCompleted) return true;

  const now = new Date();
  const diff = now.getTime() - lastCompleted.getTime();
  const hours = diff / (1000 * 60 * 60);

  return hours >= cooldownHours;
};

export const getNextTaskAvailableTime = (
  lastCompleted: Date,
  cooldownHours: number
) => {
  const nextTime = new Date(lastCompleted.getTime() + cooldownHours * 60 * 60 * 1000);
  return nextTime;
};

export const getRemainingCooldown = (
  lastCompleted: Date,
  cooldownHours: number
) => {
  if (!canCompleteTask(lastCompleted, cooldownHours)) {
    const nextTime = getNextTaskAvailableTime(lastCompleted, cooldownHours);
    const now = new Date();
    const diff = nextTime.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60));
  }
  return 0;
};
