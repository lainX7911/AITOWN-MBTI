export type HistoryRunStatus =
  | 'draft'
  | 'creating'
  | 'awaiting_user_responses'
  | 'running'
  | 'complete'
  | 'failed';

export type StaleHistoryEntry = {
  createdAt: number;
  error?: string;
  experimentId?: string;
  status: HistoryRunStatus;
  worldId?: string;
};

export function settleStaleCreatingEntry<T extends StaleHistoryEntry>(
  entry: T,
  now: number,
  timeoutMs: number,
  timeoutMessage: string,
): T {
  if (entry.status !== 'creating') {
    return entry;
  }
  if (entry.experimentId || entry.worldId) {
    return entry;
  }
  if (now - entry.createdAt < timeoutMs) {
    return entry;
  }
  return {
    ...entry,
    error: timeoutMessage,
    status: 'failed',
  };
}
