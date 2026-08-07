import type { Workspace } from './types.js';
import { awardXp } from '../app/store.js';

export const unlockAchievement = (workspace: Workspace, id: string): boolean => {
  const achievement = workspace.achievements.find((item) => item.id === id);
  if (!achievement || achievement.unlockedAt) return false;
  achievement.unlockedAt = new Date().toISOString();
  return true;
};

export const productiveEvent = (
  workspace: Workspace,
  eventId: string,
  xp: number,
  skill?: keyof Workspace['skills'],
): { awarded: boolean; level: number } => {
  const beforeLevel = workspace.level;
  const awarded = awardXp(workspace,eventId,xp,skill);
  if (awarded) {
    const today = new Date().toISOString().slice(0,10);
    const streakEvent = `streak:${today}`;
    if (!workspace.earnedEvents.includes(streakEvent)) {
      workspace.earnedEvents.push(streakEvent);
      workspace.streak += 1;
    }
  }
  return { awarded, level: workspace.level > beforeLevel ? workspace.level : 0 };
};
