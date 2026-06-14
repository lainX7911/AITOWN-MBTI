export type TownClockPhase = 'morning' | 'afternoon' | 'evening' | 'night';

export const simulatedTownDayMs = 15 * 60 * 1000;

export function liveTownTimelineNode<T extends {
  createdAt: number;
  dayProgress?: number;
  phase: TownClockPhase;
  townDay: number;
}>(node: T | undefined, now: number): T | undefined {
  if (!node) {
    return undefined;
  }
  const elapsedDays = Math.max(0, now - node.createdAt) / simulatedTownDayMs;
  const absoluteDayProgress = Math.max(0, node.townDay - 1 + (node.dayProgress ?? phaseProgress(node.phase)) + elapsedDays);
  const dayProgress = absoluteDayProgress % 1;
  return {
    ...node,
    townDay: Math.floor(absoluteDayProgress) + 1,
    phase: phaseFromTownProgress(dayProgress),
    dayProgress,
  };
}

export function phaseProgress(phase: TownClockPhase) {
  if (phase === 'afternoon') {
    return 0.25;
  }
  if (phase === 'evening') {
    return 0.5;
  }
  if (phase === 'night') {
    return 0.75;
  }
  return 0;
}

export function phaseFromTownProgress(dayProgress: number): TownClockPhase {
  if (dayProgress < 0.25) {
    return 'morning';
  }
  if (dayProgress < 0.5) {
    return 'afternoon';
  }
  if (dayProgress < 0.75) {
    return 'evening';
  }
  return 'night';
}
